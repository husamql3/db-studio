# React Email Integration

## What It Is
Use React components to create emails. Direct JSX import via Bun.

## Installation
```bash
bun add -d react-email
bun add @react-email/components react react-dom
```

Script in `package.json`:
```json
{
  "scripts": {
    "email": "email dev --dir src/emails"
  }
}
```

Email templates → `src/emails` directory.

### TypeScript
Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "jsx": "react"
  }
}
```

## Email Template
```tsx
// src/emails/otp.tsx
import * as React from 'react'
import { Tailwind, Section, Text } from '@react-email/components'

export default function OTPEmail({ otp }: { otp: number }) {
  return (
    <Tailwind>
      <Section className="flex justify-center items-center w-full min-h-screen font-sans">
        <Section className="flex flex-col items-center w-76 rounded-2xl px-6 py-1 bg-gray-50">
          <Text className="text-xs font-medium text-violet-500">
            Verify your Email Address
          </Text>
          <Text className="text-gray-500 my-0">
            Use the following code to verify your email address
          </Text>
          <Text className="text-5xl font-bold pt-2">{otp}</Text>
          <Text className="text-gray-400 font-light text-xs pb-4">
            This code is valid for 10 minutes
          </Text>
          <Text className="text-gray-600 text-xs">
            Thank you for joining us
          </Text>
        </Section>
      </Section>
    </Tailwind>
  )
}

OTPEmail.PreviewProps = { otp: 123456 }
```

`@react-email/components` → email-client compatible (Gmail, Outlook). Tailwind support.

`PreviewProps` → playground only.

## Preview
```bash
bun email
```

Opens browser with preview.

## Send Email
Render with `react-dom/server`, submit via provider:

### Nodemailer
```typescript
import { renderToStaticMarkup } from 'react-dom/server'
import OTPEmail from './emails/otp'
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gehenna.sh',
  port: 465,
  auth: { user: 'makoto', pass: '12345678' }
})

.get('/otp', async ({ body }) => {
  const otp = ~~(Math.random() * 900_000) + 100_000
  const html = renderToStaticMarkup(<OTPEmail otp={otp} />)
  
  await transporter.sendMail({
    from: '[email protected]',
    to: body,
    subject: 'Verify your email address',
    html
  })
  
  return { success: true }
}, {
  body: t.String({ format: 'email' })
})
```

### Resend
```typescript
import OTPEmail from './emails/otp'
import Resend from 'resend'

const resend = new Resend('re_123456789')

.get('/otp', ({ body }) => {
  const otp = ~~(Math.random() * 900_000) + 100_000
  
  await resend.emails.send({
    from: '[email protected]',
    to: body,
    subject: 'Verify your email address',
    html: <OTPEmail otp={otp} />  // Direct JSX
  })
  
  return { success: true }
})
```

Direct JSX import thanks to Bun.

Other providers: AWS SES, SendGrid.

See [React Email Integrations](https://react.email/docs/integrations/overview).
