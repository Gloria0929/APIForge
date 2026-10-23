"""
APIForge Locust runner.

Locust loads this file via ``-f``. The plan (already-resolved requests, runtime
variables, extract rules and assertions) is passed as JSON through the
APIFORGE_LOCUST_PLAN environment variable so the same file serves every run.
"""
import base64
import json
import os
import re
import threading
import time

import gevent
from locust import HttpUser, events, task

PLAN = json.load(open(os.environ["APIFORGE_LOCUST_PLAN"], encoding="utf-8"))
PROGRESS_PREFIX = "##APIFORGE_PROGRESS "
VAR_RE = re.compile(r"{{\s*([a-zA-Z0-9_.-]+)\s*}}")

_lock = threading.Lock()
_total = 0
_failed = 0
_runs = 0
_started_runs = 0
_stopped = False
_quit_requested = False
_started_at = time.time()


def _record(ok):
    global _total, _failed
    with _lock:
        _total += 1
        if not ok:
            _failed += 1


def _abort_requested():
    """True when the failure-rate threshold trips; in-flight scenarios stop at the next step."""
    global _stopped
    if _stopped:
        return True
    with _lock:
        limit = PLAN.get("stopOnFailRate")
        if limit is not None and limit > 0 and _total >= 10 and _failed * 100 / _total >= limit:
            _stopped = True
            print("失败率达到阈值，正在停止新请求并生成报告", flush=True)
        return _stopped


def _request_quit(user):
    """
    runner.quit() blocks if called from a user greenlet, so run it outside.

    Locust's CSV writer samples stats once per second; quitting immediately after
    the last request leaves an empty stats file. Wait one writer cycle first.
    """
    global _quit_requested
    with _lock:
        if _quit_requested:
            return
        _quit_requested = True
    gevent.spawn_later(1.2, user.environment.runner.quit)


def _emit_progress(environment):
    with _lock:
        snapshot = {
            "total": _total, "failed": _failed, "runs": _runs,
            "elapsedSeconds": round(time.time() - _started_at, 1),
            "users": environment.runner.user_count,
            "avgResponseTime": round(environment.stats.total.avg_response_time, 1),
            "p95ResponseTime": environment.stats.total.get_response_time_percentile(0.95) or 0,
            "stopReason": "failure_rate" if _stopped else "",
        }
    print(PROGRESS_PREFIX + json.dumps(snapshot), flush=True)


def _progress_reporter(environment):
    """Print a machine-readable line per second for the backend/UI."""
    while environment.runner is not None:
        gevent.sleep(1.0)
        _emit_progress(environment)


@events.test_start.add_listener
def _start_progress_reporter(environment, **_kwargs):
    global _started_at
    _started_at = time.time()
    gevent.spawn(_progress_reporter, environment)


@events.test_stop.add_listener
def _final_progress(environment, **_kwargs):
    _emit_progress(environment)


def render(value, variables):
    if isinstance(value, str):
        return VAR_RE.sub(lambda m: str(variables.get(m.group(1), m.group(0))), value)
    if isinstance(value, list):
        return [render(item, variables) for item in value]
    if isinstance(value, dict):
        return {key: render(item, variables) for key, item in value.items()}
    return value


def unresolved_variables(value):
    found = set()

    def walk(node):
        if isinstance(node, str):
            found.update(m.group(1) for m in VAR_RE.finditer(node))
        elif isinstance(node, list):
            for item in node:
                walk(item)
        elif isinstance(node, dict):
            for item in node.values():
                walk(item)

    walk(value)
    return sorted(found)


def stringify(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    return json.dumps(value, ensure_ascii=False)


def json_path(obj, path):
    if not path:
        return None
    text = str(path).strip()
    if text.startswith("$"):
        text = text[1:]
    if text.startswith("."):
        text = text[1:]
    tokens = []
    for match in re.finditer(r"""(?:\.?([\w-]+))|\[(\d+)\]|\[["']([^"']+)["']\]""", text):
        if match.group(1) is not None:
            tokens.append(match.group(1))
        elif match.group(2) is not None:
            tokens.append(int(match.group(2)))
        else:
            tokens.append(match.group(3))
    current = obj
    for token in tokens:
        if isinstance(current, dict):
            current = current.get(token)
        elif isinstance(current, list):
            index = token if isinstance(token, int) else (int(token) if str(token).isdigit() else -1)
            if not 0 <= index < len(current):
                return None
            current = current[index]
        else:
            return None
    return current


def compare(actual, condition, expected):
    if isinstance(expected, dict):
        if "$exists" in expected:
            exists = actual is not None
            return exists if expected["$exists"] else not exists
        if "$regex" in expected:
            try:
                return re.search(str(expected["$regex"]), str(actual)) is not None
            except re.error:
                return False
    if condition == "eq":
        return actual == expected
    if condition == "neq":
        return actual != expected
    if condition in ("gt", "lt"):
        try:
            return float(actual) > float(expected) if condition == "gt" else float(actual) < float(expected)
        except (TypeError, ValueError):
            return False
    if condition == "contains":
        return str(expected) in stringify(actual)
    if condition in ("exists", "not_empty"):
        if actual is None:
            return False
        if condition == "exists":
            return True
        if isinstance(actual, (str, list, dict)):
            return len(actual) > 0
        return True
    if condition == "matches":
        try:
            return re.search(str(expected), stringify(actual)) is not None
        except re.error:
            return False
    return False


def normalize_assertion(raw):
    item = dict(raw or {})
    if not item.get("target") and item.get("path"):
        item["target"] = item["path"]
    expected = item.get("expected")
    if item.get("type") == "JSON_PATH" and not item.get("target") and isinstance(expected, str) and expected.startswith("$."):
        item["target"] = expected
        if item.get("condition") == "exists":
            item["expected"] = True
    if isinstance(expected, dict):
        for flag, condition in (("$exists", "exists"), ("$regex", "matches"), ("$contains", "contains"),
                                ("$gt", "gt"), ("$lt", "lt"), ("$neq", "neq"), ("$eq", "eq")):
            if flag in expected:
                item["condition"] = condition
                item["expected"] = expected[flag]
                break
    if not item.get("condition"):
        item["condition"] = "eq"
    if item["condition"] == "not_empty":
        item["condition"] = "exists"
        item["expected"] = True
    return item


def assertion_failures(assertions, status, body, response_time):
    reasons = []
    for raw in assertions or []:
        item = normalize_assertion(raw)
        kind = item.get("type")
        if kind == "STATUS":
            actual = status
        elif kind == "JSON_PATH":
            actual = json_path(body, item.get("target"))
        elif kind == "RESPONSE_TIME":
            actual = response_time
        else:
            reasons.append("%s 断言类型暂不支持" % kind)
            continue
        if not compare(actual, item.get("condition"), item.get("expected")):
            reasons.append("%s %s %s，实际 %s" % (kind, item.get("target") or "", item.get("condition"), actual))
    return reasons


def form_parts(body_form, body):
    parts = []
    if isinstance(body_form, list):
        parts = [(str(p.get("key") or "").strip(), p) for p in body_form if isinstance(p, dict)]
    elif isinstance(body_form, dict):
        parts = [(str(k), {"value": v}) for k, v in body_form.items()]
    elif isinstance(body, dict):
        parts = [(str(k), {"value": v}) for k, v in body.items()]

    data = {}
    files = {}
    for key, part in parts:
        if not key:
            continue
        value = part.get("value")
        if str(part.get("type") or "text").lower() == "file" and isinstance(value, str) and value:
            try:
                files[key] = (part.get("filename") or "file", base64.b64decode(value))
                continue
            except Exception:
                pass
        data[key] = stringify(value)
    return data, files


class ForgeUser(HttpUser):
    host = PLAN.get("host") or "http://localhost"
    request_timeout = max(float(PLAN.get("timeoutMs") or 30000), 1000) / 1000

    def on_start(self):
        self.variables = dict(PLAN.get("variables") or {})

    def record_failure(self, name, message, method="GET"):
        self.environment.events.request.fire(
            request_type=method,
            name=name,
            response_time=0,
            response_length=0,
            exception=RuntimeError(message),
            context={},
        )
        _record(False)

    def evaluate(self, step, response):
        error = getattr(response, "error", None)
        if error is not None or response.status_code == 0:
            return False, "ERROR: %s" % (error or "请求未获得响应")

        body = None
        try:
            body = response.json()
        except Exception:
            body = None

        for key, path in (step.get("extractRules") or {}).items():
            value = json_path(body, path)
            if value is not None:
                self.variables[key] = value

        reasons = []
        if response.status_code >= 400:
            reasons.append("HTTP %s" % response.status_code)
        reasons.extend(assertion_failures(
            step.get("assertions"),
            response.status_code,
            body,
            response.elapsed.total_seconds() * 1000,
        ))
        if reasons:
            return False, "FAILED: " + "；".join(reasons)
        return True, ""

    def send(self, step, name, scope):
        method = str(step.get("method") or "GET").upper()
        url = render(step.get("url") or "", scope)
        headers = render(step.get("headers") or {}, scope)
        params = render(step.get("query") or {}, scope)
        body = render(step.get("body"), scope)
        body_form = render(step.get("bodyForm"), scope)

        missing = unresolved_variables([url, headers, params, body, body_form])
        if missing:
            self.record_failure(name, "ERROR: 请求中仍有未解析的变量：%s" % "、".join(missing), method)
            return

        body_type = str(step.get("bodyType") or "json").lower()
        kwargs = {}
        headers = {str(k): stringify(v) for k, v in (headers or {}).items()}
        if body_type in ("", "none"):
            pass
        elif body_type in ("urlencoded", "x-www-form-urlencoded"):
            headers = {k: v for k, v in headers.items() if k.lower() != "content-type"}
            headers["Content-Type"] = "application/x-www-form-urlencoded"
            data, _ = form_parts(body_form, body)
            kwargs["data"] = data
        elif body_type in ("form-data", "formdata", "multipart"):
            headers = {k: v for k, v in headers.items() if k.lower() != "content-type"}
            data, files = form_parts(body_form, body)
            if data:
                kwargs["data"] = data
            if files:
                kwargs["files"] = files
        elif body is not None:
            if isinstance(body, str):
                kwargs["data"] = body
            else:
                kwargs["json"] = body

        try:
            with self.client.request(
                method, url, params=params or None, headers=headers or None,
                name=name, catch_response=True, timeout=self.request_timeout, **kwargs
            ) as response:
                try:
                    ok, reason = self.evaluate(step, response)
                except Exception as exc:
                    ok, reason = False, "ERROR: %s" % exc
                if ok:
                    response.success()
                else:
                    response.failure(reason)
        except Exception:  # Locust already records the transport failure
            _record(False)
            return
        _record(ok)

    def run_step(self, step):
        name = step.get("name") or "Step"
        repeat = step.get("repeat") or {}
        iterations = [None]
        if repeat.get("sourceKey"):
            source = self.variables.get(repeat["sourceKey"])
            if not isinstance(source, list) or not source:
                self.record_failure(name, "ERROR: 循环数据源 %s 为空或不是数组" % repeat["sourceKey"], step.get("method") or "GET")
                return
            iterations = []
            for item in source:
                value = json_path(item, repeat.get("itemPath")) if repeat.get("itemPath") else item
                iterations.append({repeat.get("itemVar"): "" if value is None else value})

        for index, extra in enumerate(iterations):
            if _stopped:
                return
            label = name if len(iterations) == 1 else "%s [%d/%d]" % (name, index + 1, len(iterations))
            scope = {**self.variables, **extra} if extra else self.variables
            self.send(step, label, scope)
            if step.get("delayMs"):
                time.sleep(step["delayMs"] / 1000.0)

    @task
    def run_scenario(self):
        global _runs, _started_runs
        if _abort_requested():
            _request_quit(self)
            return
        if PLAN.get("mode") == "requests":
            reserved = False
            with _lock:
                if _started_runs < int(PLAN.get("totalRequests") or 0):
                    _started_runs += 1
                    reserved = True
            if not reserved:
                gevent.sleep(0.05)
                return
        # Each iteration is an independent business flow; extracted values from
        # a previous iteration must never mask a failed extraction in this one.
        self.variables = dict(PLAN.get("variables") or {})
        for step in PLAN.get("steps") or []:
            if _abort_requested():
                break
            self.run_step(step)
        with _lock:
            if not _stopped:
                _runs += 1
            finished = PLAN.get("mode") == "requests" and _runs >= int(PLAN.get("totalRequests") or 0)
        if finished or _abort_requested():
            _request_quit(self)
