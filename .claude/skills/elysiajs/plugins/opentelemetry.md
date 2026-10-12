# OpenTelemetry Plugin - SKILLS.md

## Installation
```bash
bun add @elysiajs/opentelemetry
```

## Basic Usage
```typescript
import { opentelemetry } from '@elysiajs/opentelemetry'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'

new Elysia()
  .use(opentelemetry({
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter())
    ]
  }))
```

Auto-collects spans from OpenTelemetry-compatible libraries. Parent/child spans applied automatically.

## Config
Extends OpenTelemetry SDK params:

- `autoDetectResources` (true) - Auto-detect from env
- `contextManager` (AsyncHooksContextManager) - Custom context
- `textMapPropagator` (CompositePropagator) - W3C Trace + Baggage
- `metricReader` - For MeterProvider
- `views` - Histogram bucket config
- `instrumentations` (getNodeAutoInstrumentations()) - Metapackage or individual
- `resource` - Custom resource
- `resourceDetectors` ([envDetector, processDetector, hostDetector]) - Auto-detect needs `autoDetectResources: true`
- `sampler` - Custom sampler (default: sample all)
- `serviceName` - Namespace identifier
- `spanProcessors` - Array for tracer provider
- `traceExporter` - Auto-setup OTLP/http/protobuf with BatchSpanProcessor if not set
- `spanLimits` - Tracing params

### Resource Detectors via Env
```bash
export OTEL_NODE_RESOURCE_DETECTORS="env,host"
# Options: env, host, os, process, serviceinstance, all, none
```

## Export to Backends
Example - Axiom:
```typescript
.use(opentelemetry({
  spanProcessors: [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: 'https://api.axiom.co/v1/traces',
        headers: {
          Authorization: `Bearer ${Bun.env.AXIOM_TOKEN}`,
          'X-Axiom-Dataset': Bun.env.AXIOM_DATASET
        }
      })
    )
  ]
}))
```

## OpenTelemetry SDK
Use SDK normally - runs under Elysia's request span, auto-appears in trace.

## Record Utility
Equivalent to `startActiveSpan` - auto-closes + captures exceptions:
```typescript
import { record } from '@elysiajs/opentelemetry'

.get('', () => {
  return record('database.query', () => {
    return db.query('SELECT * FROM users')
  })
})
```

Label for code shown in trace.

## Function Naming
Elysia reads function names as span names:
```typescript
// ⚠️ Anonymous span
.derive(async ({ cookie: { session } }) => {
  return { user: await getProfile(session) }
})

// ✅ Named span: "getProfile"
.derive(async function getProfile({ cookie: { session } }) {
  return { user: await getProfile(session) }
})
```

## getCurrentSpan
Get current span outside handler (via AsyncLocalStorage):
```typescript
import { getCurrentSpan } from '@elysiajs/opentelemetry'

function utility() {
  const span = getCurrentSpan()
  span.setAttributes({ 'custom.attribute': 'value' })
}
```

## setAttributes
Sugar for `getCurrentSpan().setAttributes`:
```typescript
import { setAttributes } from '@elysiajs/opentelemetry'

function utility() {
  setAttributes({ 'custom.attribute': 'value' })
}
```

## Instrumentations (Advanced)
SDK must run before importing instrumented module.

### Setup
1. Separate file:
```typescript
// src/instrumentation.ts
import { opentelemetry } from '@elysiajs/opentelemetry'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'

export const instrumentation = opentelemetry({
  instrumentations: [new PgInstrumentation()]
})
```

2. Apply:
```typescript
// src/index.ts
import { instrumentation } from './instrumentation'
new Elysia().use(instrumentation).listen(3000)
```

3. Preload:
```toml
# bunfig.toml
preload = ["./src/instrumentation.ts"]
```

### Production Deployment (Advanced)
OpenTelemetry monkey-patches `node_modules`. Exclude instrumented libs from bundling:
```bash
bun build --compile --external pg --outfile server src/index.ts
```

Package.json:
```json
{
  "dependencies": { "pg": "^8.15.6" },
  "devDependencies": {
    "@elysiajs/opentelemetry": "^1.2.0",
    "@opentelemetry/instrumentation-pg": "^0.52.0"
  }
}
```

Production install:
```bash
bun install --production
```

Keeps `node_modules` with instrumented libs at runtime.
