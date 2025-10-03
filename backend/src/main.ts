import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Статическая раздача файлов из папки uploads
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });
  
  // Статическая раздача файлов из папки public (веб-чат)
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/public/',
  });
  
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
