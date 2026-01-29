import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sender, receiver, subject, html } = body;

    // Validation
    if (!sender?.email || !sender?.password) {
      return NextResponse.json(
        { success: false, error: 'Missing sender credentials' },
        { status: 400 }
      );
    }

    if (!receiver?.email) {
      return NextResponse.json(
        { success: false, error: 'Missing receiver email' },
        { status: 400 }
      );
    }

    // Configure Nodemailer with Gmail SMTP TLS
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // TLS
      auth: {
        user: sender.email.trim(),
        pass: sender.password.trim(),
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Verify connection
    try {
      await transporter.verify();
      console.log('✓ SMTP connection verified');
    } catch (verifyError: any) {
      console.error('✗ SMTP verification failed:', verifyError.message);
      return NextResponse.json(
        {
          success: false,
          error: `Auth failed: ${verifyError.message}. Use App Passwords for Gmail.`,
        },
        { status: 401 }
      );
    }

    // Send email
    const info = await transporter.sendMail({
      from: `"${sender.name || 'Team'}" <${sender.email}>`,
      to: receiver.email,
      subject: subject || 'Hello',
      html: html || '<p>Hello</p>',
    });

    console.log('✓ Email sent:', info.messageId);

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    });

  } catch (error: any) {
    console.error('✗ Server error:', error.message);

    let userMessage = error.message;
    if (error.code === 'EAUTH') {
      userMessage = 'Invalid email or app password';
    } else if (error.message?.includes('Invalid login')) {
      userMessage = 'Invalid credentials';
    } else if (error.message?.includes('SMTP')) {
      userMessage = 'SMTP connection failed';
    }

    return NextResponse.json(
      { success: false, error: userMessage },
      { status: 500 }
    );
  }
}
