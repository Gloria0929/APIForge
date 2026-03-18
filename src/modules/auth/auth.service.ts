import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as crypto from "crypto";
import { User } from "./user.entity";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private hashPassword(password: string): string {
    return crypto.createHash("sha256").update(password).digest("hex");
  }

  private verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }

  async ensureAdminExists(): Promise<string | null> {
    const admin = await this.userRepository.findOne({
      where: { username: "admin" },
    });
    if (admin) return null;

    const plainPassword = crypto.randomBytes(12).toString("base64url");
    const hash = this.hashPassword(plainPassword);
    await this.userRepository.save({
      username: "admin",
      passwordHash: hash,
    });
    return plainPassword;
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ token: string; username: string; mustChangePassword: boolean }> {
    const user = await this.userRepository.findOne({
      where: { username: username.trim() },
    });
    if (!user || !this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException("账号或密码错误");
    }
    const token = crypto.randomBytes(32).toString("hex");
    await this.userRepository.update(user.id, { token });
    return {
      token,
      username: user.username,
      mustChangePassword: Boolean(user.mustChangePassword),
    };
  }

  async clearToken(token: string): Promise<void> {
    await this.userRepository.update({ token }, { token: null });
  }

  async validateToken(token: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { token },
    });
    return Boolean(user);
  }

  async changePassword(
    username: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { username: username.trim() },
    });
    if (!user || !this.verifyPassword(oldPassword, user.passwordHash)) {
      throw new UnauthorizedException("原密码错误");
    }
    const newHash = this.hashPassword(newPassword);
    await this.userRepository.update(user.id, {
      passwordHash: newHash,
      mustChangePassword: false,
    });
  }
}
