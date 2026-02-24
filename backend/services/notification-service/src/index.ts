import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import nodemailer from 'nodemailer'

const app = Fastify({
  logger: { level: 'info', transport: { target: 'pino-pretty', options: { colorize: true } } },
})

// Email transport (uses Mailhog locally — no real emails sent in dev)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
})

app.get('/health', async () => ({ status: 'ok', service: 'notification-service' }))

// POST /notifications/email — send an email
app.post('/notifications/email', async (req, reply) => {
  const { to, subject, htmlBody, attachments } = req.body as {
    to: string[]; subject: string; htmlBody: string; attachments?: Array<{ filename: string; path: string }>
  }

  try {
    const info = await transporter.sendMail({
      from:        `"${process.env.EMAIL_FROM_NAME ?? 'LMS'}" <${process.env.EMAIL_FROM ?? 'noreply@lms.local'}>`,
      to:          to.join(', '),
      subject,
      html:        htmlBody,
      attachments: attachments ?? [],
    })

    app.log.info(`Email sent: ${info.messageId}`)
    return { data: { messageId: info.messageId, accepted: info.accepted } }
  } catch (err) {
    app.log.error(err, 'Email send failed')
    return reply.status(500).send({ error: 'Failed to send email' })
  }
})

// POST /notifications/badge-issued — notify learner of new badge
app.post('/notifications/badge-issued', async (req) => {
  const { userEmail, userName, badgeName, assertionUrl } = req.body as {
    userEmail: string; userName: string; badgeName: string; assertionUrl: string
  }

  await transporter.sendMail({
    from:    `"LMS" <${process.env.EMAIL_FROM ?? 'noreply@lms.local'}>`,
    to:      userEmail,
    subject: `🏅 You earned the "${badgeName}" badge!`,
    html: `
      <h2>Congratulations, ${userName}!</h2>
      <p>You just earned the <strong>${badgeName}</strong> badge.</p>
      <p><a href="${assertionUrl}">View your badge</a></p>
    `,
  })

  return { data: { sent: true } }
})

// POST /notifications/cert-issued — notify learner of certificate
app.post('/notifications/cert-issued', async (req) => {
  const { userEmail, userName, courseTitle, verifyUrl, pdfUrl } = req.body as {
    userEmail: string; userName: string; courseTitle: string; verifyUrl: string; pdfUrl?: string
  }

  await transporter.sendMail({
    from:    `"LMS" <${process.env.EMAIL_FROM ?? 'noreply@lms.local'}>`,
    to:      userEmail,
    subject: `📜 Your certificate for "${courseTitle}" is ready!`,
    html: `
      <h2>Well done, ${userName}!</h2>
      <p>You have successfully completed <strong>${courseTitle}</strong>.</p>
      <p><a href="${verifyUrl}">View & verify your certificate</a></p>
      ${pdfUrl ? `<p><a href="${pdfUrl}">Download PDF</a></p>` : ''}
    `,
  })

  return { data: { sent: true } }
})

async function start() {
  await app.register(cors, { origin: true })
  const port = Number(process.env.NOTIFICATION_SERVICE_PORT ?? 3007)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`🚀 Notification Service on port ${port}`)
}

start().catch((err) => { console.error(err); process.exit(1) })
