EMAIL BLASTER - READ ME FIRST
=============================

WHAT THIS IS
  A single-page email campaign tool. It runs on THIS computer and sends mail
  through your own SMTP server (Gmail or any other host). Nothing is uploaded
  anywhere: your SMTP password never leaves this PC.


HOW TO RUN
  1. Click the "Email Blaster" icon on your Desktop (or in the Start Menu).
  2. The app opens in its own window - no address bar, no tabs, no bookmarks
     bar. It looks like a normal program and gets its own taskbar button.
  3. That's it. There is no console window to keep open - the app runs quietly
     in the background on this PC.

  Clicking the icon again just brings that window back. It never starts a
  second copy.

  The window is drawn by the browser you normally use (Edge, Chrome or Brave),
  so your saved leads and sender settings are the same ones you had before. If
  your default browser is something else (e.g. Firefox), the app opens in a
  normal browser tab instead.


HOW TO STOP IT
  Start Menu -> "Stop Email Blaster".
  Or simply restart / shut down the PC. Nothing starts automatically.
HOW TO SET UP SENDERS
  In the Senders tab, for each account enter:

    Email        the full email address
    Password     the SMTP password
                   - Gmail: an "app password" (needs 2-Step Verification on)
                   - Other hosts: the normal mailbox password
    SMTP Host    e.g. smtp.gmail.com  or  mail.yourcompany.com
    Port         587 (standard)  or  465 (SSL)
    SSL          tick only for port 465
    Weight       how many emails this account may send before its pool is used up
    Min / Max    random wait in seconds before each send

  Common settings:
    Gmail / Google Workspace   smtp.gmail.com    587   SSL off (app password required)
    Microsoft 365              smtp.office365.com 587  SSL off
    Most hosting providers     mail.yourdomain.com 465 SSL on

  From_Email column (optional): if a lead row names a sender, that row is sent
  through that account only. The address must exist and be active above.


WHAT IT NEEDS
  - Windows 10 or 11, 64-bit
  - Outbound internet access on port 587 or 465
  - Antivirus/firewall: allow node.exe to make outgoing connections


YOUR DATA
  Sender settings and lead sheets are saved in your browser's local storage for
  http://127.0.0.1:3100. Use the same browser and the same port each time, and
  do not clear site data or the sheet is lost. Use "Download CSV" to back up.

  Passwords are never saved. They must be typed again after a reload.


TROUBLESHOOTING
  The browser shows "can't reach this page"
    Start Menu -> "Email Blaster (show window)" and read the message in the
    window that appears. Then close that window and click the Desktop icon again.
  "Could not reach <host>:<port>"
    Wrong SMTP host or port, or a firewall is blocking port 587/465.
    Try port 465 with SSL ticked.

  "SMTP authentication failed"
    Wrong password. For Gmail use an app password, not the normal login.

  "Could not start ... port 3100"
    A previous copy is still running or something else took the port.
    Start Menu -> "Stop Email Blaster", then click the Desktop icon again.
  Attachment too large
    Attachments are limited to 3 MB per email.

UNINSTALL
  Windows Settings -> Apps -> "Email Blaster" -> Uninstall.
  Your lead sheets are kept in the browser, so export them first with
  "Download CSV" if you want a copy.


