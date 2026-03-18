import { Controller, Post, Body, Req } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { Public } from "./public.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() body: { account: string; password: string }) {
    return this.authService.login(
      body.account || "",
      body.password || "",
    );
  }

  @Post("logout")
  async logout(@Req() req: { headers: { authorization?: string } }) {
    const auth = req.headers?.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (token) {
      await this.authService.clearToken(token);
    }
  }

  @Post("change-password")
  changePassword(
    @Body() body: { username: string; oldPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(
      body.username || "",
      body.oldPassword || "",
      body.newPassword || "",
    );
  }
}
