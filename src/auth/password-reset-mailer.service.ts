import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class PasswordResetMailerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PasswordResetMailerService.name);
  private transporter: Transporter | null = null;
  private from: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const password = this.configService.get<string>('SMTP_PASS');
    const from = this.configService.get<string>('SMTP_FROM');

    if (
      !host ||
      !user ||
      !password ||
      !from ||
      password === 'TU_PASSWORD_REAL_DE_MAILTRAP'
    ) {
      this.handleConfigurationError(
        new Error('Configura SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_FROM'),
      );
      return;
    }

    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 2525);

    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
      this.handleConfigurationError(new Error('SMTP_PORT no es válido'));
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: { user, pass: password },
    });
    this.from = from;

    try {
      await this.transporter.verify();
      this.logger.log('Conexión SMTP con Mailtrap verificada correctamente');
    } catch (error) {
      this.transporter = null;
      this.from = null;
      this.handleConfigurationError(error);
    }
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  async send(email: string, token: string): Promise<void> {
    const resetUrl = new URL(
      this.configService.get<string>('PASSWORD_RESET_URL') ??
        'http://localhost:3001/reset-password',
    );
    resetUrl.searchParams.set('token', token);

    try {
      await this.sendMail({
        to: email,
        subject: 'Restablece tu contraseña',
        text: `Usa este enlace para restablecer tu contraseña: ${resetUrl.toString()}`,
        html: this.renderEmail({
          eyebrow: 'SEGURIDAD DE CUENTA',
          title: 'Restablece tu contraseña',
          message:
            'Recibimos una solicitud para cambiar la contraseña de tu cuenta. Usa el botón de abajo para continuar.',
          action: 'Crear nueva contraseña',
          url: resetUrl.toString(),
          note: 'Este enlace es de un solo uso y expirará pronto. Si no solicitaste el cambio, puedes ignorar este correo.',
        }),
      });
    } catch (error) {
      this.logger.error('No se pudo enviar el correo de recuperación', error);
    }
  }

  async sendVerification(email: string, token: string): Promise<void> {
    const ttlHours =
      this.configService.get<string>('EMAIL_VERIFICATION_TTL_HOURS') ?? '24';
    const verificationUrl = new URL(
      this.configService.get<string>('EMAIL_VERIFICATION_URL') ??
        'http://localhost:3001/verify-email',
    );
    verificationUrl.searchParams.set('token', token);

    try {
      await this.sendMail({
        to: email,
        subject: 'Verifica tu correo electrónico',
        text: `Confirma tu correo usando este enlace: ${verificationUrl.toString()}`,
        html: this.renderEmail({
          eyebrow: 'BIENVENIDO A PAINT',
          title: 'Confirma tu correo',
          message:
            '¡Gracias por crear tu cuenta! Confirma tu dirección de correo electrónico para empezar.',
          action: 'Verificar mi correo',
          url: verificationUrl.toString(),
          note: `Por seguridad, este enlace vence en ${ttlHours} horas y solo puede utilizarse una vez.`,
        }),
      });
    } catch (error) {
      this.logger.error('No se pudo enviar el correo de verificación', error);
    }
  }

  async sendTest(email: string): Promise<void> {
    await this.sendMail({
      to: email,
      subject: '[MAILTRAP] Prueba SMTP',
      text: 'La configuración SMTP de Mailtrap funciona correctamente.',
      html: '<p>La configuración SMTP de Mailtrap funciona correctamente.</p>',
    });
  }

  private async sendMail(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    if (!this.transporter || !this.from) {
      throw new Error('SMTP no está configurado');
    }

    await this.transporter.sendMail({
      from: this.from,
      ...message,
    });
    this.logger.log('Correo enviado correctamente a Mailtrap');
  }

  private renderEmail(content: {
    eyebrow: string;
    title: string;
    message: string;
    action: string;
    url: string;
    note: string;
  }): string {
    const safeUrl = this.escapeHtml(content.url);

    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${content.title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${content.message}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f5f9;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e7eaf0;border-radius:18px;overflow:hidden;">
          <tr><td style="padding:32px 40px 24px;border-bottom:1px solid #edf0f5;">
            <div style="font-size:20px;font-weight:700;letter-spacing:-.4px;color:#172033;">PAINT<span style="color:#4f46e5;">.</span></div>
          </td></tr>
          <tr><td style="padding:36px 40px 12px;">
            <div style="font-size:11px;line-height:18px;font-weight:700;letter-spacing:1.4px;color:#4f46e5;">${content.eyebrow}</div>
            <h1 style="margin:12px 0 14px;font-size:28px;line-height:36px;letter-spacing:-.7px;color:#172033;">${content.title}</h1>
            <p style="margin:0;font-size:16px;line-height:26px;color:#596579;">${content.message}</p>
          </td></tr>
          <tr><td align="left" style="padding:24px 40px 12px;">
            <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:10px;background-color:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;line-height:20px;font-weight:700;">${content.action}</a>
          </td></tr>
          <tr><td style="padding:16px 40px 32px;">
            <p style="margin:0;font-size:13px;line-height:21px;color:#7a8495;">${content.note}</p>
            <p style="margin:20px 0 0;font-size:12px;line-height:19px;color:#9aa3b2;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="${safeUrl}" style="color:#4f46e5;word-break:break-all;">${safeUrl}</a></p>
          </td></tr>
        </table>
        <p style="margin:20px 0 0;font-size:12px;line-height:18px;color:#98a1af;">Este mensaje fue enviado automáticamente. Por favor, no respondas a este correo.</p>
      </td></tr>
    </table>
  </body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };

      return entities[character];
    });
  }

  private handleConfigurationError(error: unknown): void {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw error;
    }

    this.logger.warn(
      `SMTP no disponible: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
