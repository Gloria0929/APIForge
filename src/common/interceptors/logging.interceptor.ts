import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap, catchError } from "rxjs/operators";
import { Request } from "express";

function timestamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();
    const method = request.method;
    const url = request.originalUrl || request.url;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const statusCode = response.statusCode ?? 200;
        const duration = Date.now() - startedAt;
        console.log(
          `[${timestamp()}] ${method} ${url} ${statusCode} ${duration}ms`,
        );
      }),
      catchError((err) => {
        const statusCode =
          err instanceof HttpException
            ? err.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;
        const duration = Date.now() - startedAt;
        console.log(
          `[${timestamp()}] ${method} ${url} ${statusCode} ${duration}ms`,
        );
        throw err;
      }),
    );
  }
}
