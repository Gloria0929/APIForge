import { Controller, Post, Body } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: { account: string; password: string }) {
    return this.authService.login(
      body.account || "",
      body.password || "",
    );
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
