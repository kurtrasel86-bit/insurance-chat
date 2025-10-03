import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

type Agent = { id: string; login: string; password: string; name: string };

const AGENTS: Agent[] = [
  { id: 'a1', login: 'agent1', password: 'password1', name: 'Agent One' },
  { id: 'a2', login: 'agent2', password: 'password2', name: 'Agent Two' },
];

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  login(login: string, password: string) {
    const agent = AGENTS.find((a) => a.login === login && a.password === password);
    if (!agent) throw new UnauthorizedException('Invalid credentials');
    const payload = { sub: agent.id, role: 'agent', name: agent.name };
    return {
      accessToken: this.jwt.sign(payload),
    };
  }
}


