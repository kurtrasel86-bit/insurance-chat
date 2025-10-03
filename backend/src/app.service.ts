import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    // Перенаправляем на веб-чат
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Страховой чат-бот</title><meta http-equiv="refresh" content="0; url=/web"></head><body><p>Перенаправление на чат...</p><script>window.location.href="/web";</script></body></html>';
  }
}
