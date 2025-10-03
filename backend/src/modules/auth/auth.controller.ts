import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: { login: string; password: string }) {
    return this.auth.login(body.login, body.password);
  }
}


