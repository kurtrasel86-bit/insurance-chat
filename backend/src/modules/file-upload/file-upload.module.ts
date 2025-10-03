import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { FileUploadController } from './file-upload.controller';
import { FileUploadService } from './file-upload.service';
import { UrlDocumentController } from './url-document.controller';
import { UrlDocumentService } from './url-document.service';
import { FileParserService } from './services/file-parser.service';
import { DuplicateDetectorService } from './services/duplicate-detector.service';
import { ConflictResolverService } from './services/conflict-resolver.service';
import { DateValidatorService } from './services/date-validator.service';
import { PrismaModule } from '../prisma/prisma.module';
import { KbModule } from '../kb/kb.module';

@Module({
  imports: [
    PrismaModule,
    KbModule,
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(pdf|docx|txt)$/)) {
          return callback(new Error('Only PDF, DOCX, and TXT files are allowed!'), false);
        }
        callback(null, true);
      },
    }),
  ],
  controllers: [FileUploadController, UrlDocumentController],
  providers: [
    FileUploadService,
    UrlDocumentService,
    FileParserService,
    DuplicateDetectorService,
    ConflictResolverService,
    DateValidatorService,
  ],
  exports: [FileUploadService],
})
export class FileUploadModule {}

