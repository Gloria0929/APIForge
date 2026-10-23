"""Integration checks use only an ephemeral loopback HTTP fixture, never project environments.
Run with a Python environment that has the runtime's Locust version installed.
"""
import csv
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

RUNNER = os.environ.get('APIFORGE_RUNNER_PATH', str(Path(__file__).resolve().parents[1] / 'src/modules/test/locust_runner.py'))

@unittest.skipUnless(importlib.util.find_spec('locust'), 'Locust is not installed in this Python environment')
class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.counts = {}
        counts = self.counts
        lock = threading.Lock()
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                with lock:
                    counts[self.path] = counts.get(self.path, 0) + 1
                    count = counts[self.path]
                data = {'ok': True}
                status = 200
                if self.path == '/slow' and count != 3:
                    time.sleep(2.2)
                if self.path == '/token':
                    data = {'token': 'first-only'} if count == 1 else {}
                if self.path == '/fail':
                    status = 500
                body = json.dumps(data).encode()
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *args):
                pass
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def run_plan(self, steps, rounds=3, users=1, threshold=0, duration=None):
        host = 'http://127.0.0.1:%s' % self.server.server_port
        with tempfile.TemporaryDirectory(prefix='apiforge-runner-test-') as directory:
            plan = {'mode': 'duration' if duration else 'requests', 'durationSeconds': duration, 'totalRequests': rounds, 'host': host, 'stopOnFailRate': threshold, 'steps': steps}
            plan_path = Path(directory) / 'plan.json'
            plan_path.write_text(json.dumps(plan))
            prefix = str(Path(directory) / 'result')
            result = subprocess.run([sys.executable, '-m', 'locust', '-f', RUNNER, '--headless', '--only-summary', '--loglevel', 'WARNING', '--stop-timeout', '5', '--csv', prefix, '-u', str(users), '-r', str(users), '-t', '%ss' % (duration or 15)], env={**os.environ, 'APIFORGE_LOCUST_PLAN': str(plan_path), 'PYTHONUNBUFFERED': '1'}, text=True, capture_output=True, timeout=28)
            self.assertIn(result.returncode, [0, 1], result.stderr)
            with open(prefix + '_stats.csv') as stream:
                aggregate = next(row for row in csv.DictReader(stream) if row['Name'] == 'Aggregated')
            snapshots = [json.loads(line.split(' ', 1)[1]) for line in result.stdout.splitlines() if line.startswith('##APIFORGE_PROGRESS ')]
            self.assertTrue(snapshots, result.stderr)
            return aggregate, snapshots[-1]

    def test_parallel_rounds_wait_for_every_scenario_to_finish(self):
        aggregate, progress = self.run_plan([{'name': 'Slow', 'url': '/slow'}, {'name': 'Final', 'url': '/final'}], rounds=3, users=3)
        self.assertEqual(int(aggregate['Request Count']), 6)
        self.assertEqual(self.counts.get('/final'), 3)
        self.assertEqual(progress['runs'], 3)

    def test_zero_failure_threshold_is_disabled(self):
        aggregate, progress = self.run_plan([{'name': 'Failure', 'url': '/fail'}], rounds=20)
        self.assertEqual(int(aggregate['Request Count']), 20)
        self.assertEqual(progress['runs'], 20)
        self.assertEqual(progress['stopReason'], '')

    def test_failure_threshold_stops_after_minimum_sample(self):
        aggregate, progress = self.run_plan([{'name': 'Failure', 'url': '/fail'}], rounds=100, threshold=50)
        self.assertEqual(int(aggregate['Request Count']), 10)
        self.assertEqual(progress['stopReason'], 'failure_rate')

    def test_extracted_variables_do_not_leak_to_the_next_round(self):
        aggregate, progress = self.run_plan([{'name': 'Token', 'url': '/token', 'extractRules': {'token': '$.token'}}, {'name': 'Use', 'url': '/use/{{token}}'}], rounds=2)
        self.assertEqual(self.counts.get('/use/first-only'), 1)
        self.assertEqual(int(aggregate['Failure Count']), 1)
        self.assertEqual(progress['runs'], 2)

    def test_duration_mode_reports_completed_rounds(self):
        aggregate, progress = self.run_plan([{'name': 'Read', 'url': '/ok', 'delayMs': 50}], duration=2)
        self.assertGreater(progress['runs'], 0)
        self.assertGreater(int(aggregate['Request Count']), 0)

if __name__ == '__main__':
    unittest.main(verbosity=2)
