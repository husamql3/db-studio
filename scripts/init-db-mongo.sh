#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DB_NAME="${DB_NAME:-dbstudio}"
DB_PORT="${DB_PORT:-27017}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_CONTAINER="${DB_CONTAINER:-db-studio-mongo}"
DB_IMAGE="${DB_IMAGE:-mongo:7}"

DATABASE_URL="${DATABASE_URL:-mongodb://${DB_HOST}:${DB_PORT}/${DB_NAME}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[init-db-mongo] docker is not installed or not in PATH"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[init-db-mongo] starting existing container ${DB_CONTAINER}..."
    docker start "${DB_CONTAINER}" >/dev/null
  fi
else
  echo "[init-db-mongo] creating mongo container ${DB_CONTAINER}..."
  docker run -d \
    --name "${DB_CONTAINER}" \
    -p "${DB_PORT}:27017" \
    "${DB_IMAGE}" >/dev/null
fi

echo "[init-db-mongo] waiting for mongo to accept connections..."
until docker exec "${DB_CONTAINER}" mongosh --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; do
  sleep 1
done

echo "[init-db-mongo] applying schema and seed data..."
docker exec -i "${DB_CONTAINER}" mongosh "${DB_NAME}" --quiet <<'JS'

// ─── contributors ────────────────────────────────────────────────────────────
db.contributors.createIndex({ email: 1 }, { unique: true, sparse: true });
db.contributors.createIndex({ public_id: 1 }, { unique: true });

[
  {
    public_id: UUID().toString(),
    name: "Mona Patel",
    email: "mona@example.com",
    is_active: true,
    birth_date: new Date("1994-04-19"),
    joined_at: new Date("2024-01-15T09:00:00Z"),
    score: 98.6,
    rank: NumberInt(1),
    lifetime_commits: NumberLong("10482"),
    avatar_url: "https://avatars.example.com/mona.png",
    tags: ["typescript", "react", "lead"],
    address: { city: "Berlin", country: "DE", zip: "10115" },
    metadata: null,
  },
  {
    public_id: UUID().toString(),
    name: "Diego Rivera",
    email: "diego@example.com",
    is_active: false,
    birth_date: new Date("1991-11-03"),
    joined_at: new Date("2023-10-21T14:30:00Z"),
    score: 74.2,
    rank: NumberInt(5),
    lifetime_commits: NumberLong("3271"),
    avatar_url: null,
    tags: ["design", "figma"],
    address: { city: "Mexico City", country: "MX", zip: "06600" },
    metadata: { imported_from: "legacy", source_id: 42 },
  },
  {
    public_id: UUID().toString(),
    name: "Aiko Tanaka",
    email: "aiko@example.com",
    is_active: true,
    birth_date: new Date("1998-07-22"),
    joined_at: new Date("2025-03-01T08:15:00Z"),
    score: 88.0,
    rank: NumberInt(3),
    lifetime_commits: NumberLong("2150"),
    avatar_url: "https://avatars.example.com/aiko.png",
    tags: ["go", "backend", "devops"],
    address: { city: "Tokyo", country: "JP", zip: "100-0001" },
    metadata: null,
  },
  {
    public_id: UUID().toString(),
    name: "Luca Bianchi",
    email: "luca@example.com",
    is_active: true,
    birth_date: new Date("1987-02-14"),
    joined_at: new Date("2022-06-10T12:00:00Z"),
    score: 91.5,
    rank: NumberInt(2),
    lifetime_commits: NumberLong("18930"),
    avatar_url: "https://avatars.example.com/luca.png",
    tags: ["rust", "systems", "wasm"],
    address: { city: "Milan", country: "IT", zip: "20121" },
    metadata: { notes: "Early adopter" },
  },
  {
    public_id: UUID().toString(),
    name: "Sara Okonkwo",
    email: "sara@example.com",
    is_active: false,
    birth_date: new Date("2001-09-30"),
    joined_at: new Date("2025-01-18T17:00:00Z"),
    score: 63.8,
    rank: NumberInt(8),
    lifetime_commits: NumberLong("410"),
    avatar_url: null,
    tags: ["python", "ml"],
    address: { city: "Lagos", country: "NG", zip: null },
    metadata: null,
  },
].forEach((doc) => {
  db.contributors.updateOne(
    { email: doc.email },
    {
      $setOnInsert: { public_id: doc.public_id },
      $set: {
        name: doc.name,
        is_active: doc.is_active,
        birth_date: doc.birth_date,
        joined_at: doc.joined_at,
        score: doc.score,
        rank: doc.rank,
        lifetime_commits: doc.lifetime_commits,
        avatar_url: doc.avatar_url,
        tags: doc.tags,
        address: doc.address,
        metadata: doc.metadata,
      },
    },
    { upsert: true }
  );
});

// ─── projects ─────────────────────────────────────────────────────────────────
db.projects.createIndex({ name: 1 }, { unique: true });
db.projects.createIndex({ public_id: 1 }, { unique: true });

[
  {
    public_id: UUID().toString(),
    name: "Nebula Analytics",
    status: "active",
    budget: 125000.50,
    priority: NumberInt(1),
    total_tasks: NumberLong("384"),
    progress_pct: NumberDecimal("73.45"),
    launch_date: new Date("2025-02-01"),
    created_at: new Date("2024-12-10T10:00:00Z"),
    tech_stack: ["TypeScript", "React", "PostgreSQL"],
    config: { region: "eu-west-1", replicas: NumberInt(3), public: true },
    archived_at: null,
  },
  {
    public_id: UUID().toString(),
    name: "Atlas Mobile",
    status: "planning",
    budget: 48000.00,
    priority: NumberInt(2),
    total_tasks: NumberLong("120"),
    progress_pct: NumberDecimal("12.00"),
    launch_date: new Date("2025-06-15"),
    created_at: new Date("2025-01-07T16:45:00Z"),
    tech_stack: ["Swift", "Kotlin"],
    config: { region: "us-east-1", replicas: NumberInt(1), public: false },
    archived_at: null,
  },
  {
    public_id: UUID().toString(),
    name: "Helix Backend",
    status: "active",
    budget: 210000.00,
    priority: NumberInt(1),
    total_tasks: NumberLong("730"),
    progress_pct: NumberDecimal("91.20"),
    launch_date: new Date("2024-09-01"),
    created_at: new Date("2024-06-01T08:00:00Z"),
    tech_stack: ["Go", "gRPC", "Redis", "MySQL"],
    config: { region: "ap-southeast-1", replicas: NumberInt(5), public: false },
    archived_at: null,
  },
  {
    public_id: UUID().toString(),
    name: "Prism Design System",
    status: "archived",
    budget: 30000.00,
    priority: NumberInt(4),
    total_tasks: NumberLong("95"),
    progress_pct: NumberDecimal("100.00"),
    launch_date: new Date("2023-11-20"),
    created_at: new Date("2023-08-01T00:00:00Z"),
    tech_stack: ["Figma", "Storybook", "CSS"],
    config: { region: "eu-central-1", replicas: NumberInt(0), public: true },
    archived_at: new Date("2024-03-15T00:00:00Z"),
  },
  {
    public_id: UUID().toString(),
    name: "Quantum DevOps",
    status: "on-hold",
    budget: 75500.99,
    priority: NumberInt(3),
    total_tasks: NumberLong("215"),
    progress_pct: NumberDecimal("44.50"),
    launch_date: null,
    created_at: new Date("2025-02-20T14:00:00Z"),
    tech_stack: ["Terraform", "Kubernetes", "Helm"],
    config: { region: "us-west-2", replicas: NumberInt(2), public: false },
    archived_at: null,
  },
].forEach((doc) => {
  db.projects.updateOne(
    { name: doc.name },
    {
      $setOnInsert: { public_id: doc.public_id },
      $set: {
        status: doc.status,
        budget: doc.budget,
        priority: doc.priority,
        total_tasks: doc.total_tasks,
        progress_pct: doc.progress_pct,
        launch_date: doc.launch_date,
        created_at: doc.created_at,
        tech_stack: doc.tech_stack,
        config: doc.config,
        archived_at: doc.archived_at,
      },
    },
    { upsert: true }
  );
});

// ─── contributions ─────────────────────────────────────────────────────────────
db.contributions.createIndex({ contributor_id: 1, project_id: 1 }, { unique: true });

const mona   = db.contributors.findOne({ email: "mona@example.com" });
const diego  = db.contributors.findOne({ email: "diego@example.com" });
const aiko   = db.contributors.findOne({ email: "aiko@example.com" });
const luca   = db.contributors.findOne({ email: "luca@example.com" });
const sara   = db.contributors.findOne({ email: "sara@example.com" });
const nebula = db.projects.findOne({ name: "Nebula Analytics" });
const atlas  = db.projects.findOne({ name: "Atlas Mobile" });
const helix  = db.projects.findOne({ name: "Helix Backend" });
const prism  = db.projects.findOne({ name: "Prism Design System" });

[
  {
    contributor_id: mona._id,
    project_id: nebula._id,
    role: "Lead Engineer",
    hours_per_week: NumberInt(32),
    is_billable: true,
    rate_usd: 145.00,
    total_hours: NumberLong("1024"),
    started_at: new Date("2025-02-03"),
    ended_at: null,
    created_at: new Date("2025-02-03T09:00:00Z"),
  },
  {
    contributor_id: diego._id,
    project_id: atlas._id,
    role: "Product Designer",
    hours_per_week: NumberInt(20),
    is_billable: false,
    rate_usd: 0.00,
    total_hours: NumberLong("320"),
    started_at: new Date("2025-01-20"),
    ended_at: null,
    created_at: new Date("2025-01-20T11:30:00Z"),
  },
  {
    contributor_id: aiko._id,
    project_id: helix._id,
    role: "Backend Engineer",
    hours_per_week: NumberInt(40),
    is_billable: true,
    rate_usd: 120.00,
    total_hours: NumberLong("2080"),
    started_at: new Date("2024-06-10"),
    ended_at: null,
    created_at: new Date("2024-06-10T07:00:00Z"),
  },
  {
    contributor_id: luca._id,
    project_id: nebula._id,
    role: "Staff Engineer",
    hours_per_week: NumberInt(24),
    is_billable: true,
    rate_usd: 175.50,
    total_hours: NumberLong("768"),
    started_at: new Date("2024-12-15"),
    ended_at: null,
    created_at: new Date("2024-12-15T10:00:00Z"),
  },
  {
    contributor_id: sara._id,
    project_id: prism._id,
    role: "UX Researcher",
    hours_per_week: NumberInt(16),
    is_billable: true,
    rate_usd: 95.00,
    total_hours: NumberLong("192"),
    started_at: new Date("2023-09-01"),
    ended_at: new Date("2024-03-15"),
    created_at: new Date("2023-09-01T09:00:00Z"),
  },
  {
    contributor_id: mona._id,
    project_id: helix._id,
    role: "Consultant",
    hours_per_week: NumberInt(8),
    is_billable: true,
    rate_usd: 200.00,
    total_hours: NumberLong("96"),
    started_at: new Date("2025-01-06"),
    ended_at: null,
    created_at: new Date("2025-01-06T12:00:00Z"),
  },
].forEach((doc) => {
  db.contributions.updateOne(
    { contributor_id: doc.contributor_id, project_id: doc.project_id },
    {
      $set: {
        role: doc.role,
        hours_per_week: doc.hours_per_week,
        is_billable: doc.is_billable,
        rate_usd: doc.rate_usd,
        total_hours: doc.total_hours,
        started_at: doc.started_at,
        ended_at: doc.ended_at,
        created_at: doc.created_at,
      },
    },
    { upsert: true }
  );
});

// ─── type_showcase  (one doc per major BSON type) ─────────────────────────────
// This collection exists purely to exercise every cell renderer in the UI.
db.type_showcase.drop();

db.type_showcase.insertMany([
  {
    _label: "string",
    description: "Plain UTF-8 string",
    value_string: "Hello, World!",
    empty_string: "",
    long_string:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
      "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    unicode_string: "日本語テスト 🚀 مرحبا العالم",
  },
  {
    _label: "numbers",
    description: "All numeric BSON subtypes",
    value_int32: NumberInt(42),
    value_negative_int32: NumberInt(-7),
    value_int64: NumberLong("9007199254740993"),
    value_negative_int64: NumberLong("-1000000000000"),
    value_double: 3.141592653589793,
    value_negative_double: -2.718281828,
    value_zero: 0,
    value_decimal128: NumberDecimal("123456789.987654321"),
    value_decimal_negative: NumberDecimal("-0.000001"),
    value_infinity: Infinity,
    value_nan: NaN,
  },
  {
    _label: "boolean",
    description: "Boolean true and false",
    value_true: true,
    value_false: false,
  },
  {
    _label: "dates_and_timestamps",
    description: "Date and Timestamp types",
    value_date_now: new Date(),
    value_date_past: new Date("1970-01-01T00:00:00Z"),
    value_date_future: new Date("2099-12-31T23:59:59Z"),
    value_timestamp: Timestamp({ t: Math.floor(Date.now() / 1000), i: 1 }),
    value_timestamp_zero: Timestamp({ t: 0, i: 0 }),
  },
  {
    _label: "object_id",
    description: "ObjectId type",
    value_objectid: new ObjectId(),
    value_objectid_fixed: new ObjectId("507f1f77bcf86cd799439011"),
    ref_id: new ObjectId(),
  },
  {
    _label: "arrays",
    description: "Array of various element types",
    value_string_array: ["alpha", "beta", "gamma", "delta"],
    value_number_array: [1, 2, 3, 5, 8, 13, 21],
    value_bool_array: [true, false, true, true, false],
    value_date_array: [new Date("2024-01-01"), new Date("2024-06-01"), new Date("2025-01-01")],
    value_mixed_array: [1, "two", true, null, new Date("2024-03-15")],
    value_nested_array: [[1, 2], [3, 4], [5, 6]],
    value_empty_array: [],
    value_object_array: [
      { id: NumberInt(1), label: "first", active: true },
      { id: NumberInt(2), label: "second", active: false },
      { id: NumberInt(3), label: "third", active: true },
    ],
  },
  {
    _label: "embedded_documents",
    description: "Nested / embedded document types",
    value_flat_object: { foo: "bar", baz: NumberInt(99) },
    value_deep_object: {
      level1: {
        level2: {
          level3: { value: "deep", count: NumberInt(3) },
        },
      },
    },
    value_address: {
      street: "123 Main St",
      city: "Springfield",
      state: "IL",
      zip: "62701",
      country: "US",
      coords: { lat: 39.7817, lng: -89.6501 },
    },
    value_empty_object: {},
  },
  {
    _label: "null_and_undefined",
    description: "Null and missing fields",
    value_null: null,
    value_explicit_null: null,
    // value_missing_field intentionally absent
  },
  {
    _label: "binary_and_uuid",
    description: "BinData and UUID",
    value_uuid: UUID(),
    value_uuid_string: UUID().toString(),
    value_bindata_generic: BinData(0, "aGVsbG8gd29ybGQ="), // "hello world" base64
    value_bindata_md5: BinData(5, "mJ6th2Yrd3g="),
  },
  {
    _label: "regex",
    description: "Regular expression type",
    value_regex_simple: /^hello/i,
    value_regex_global: /[a-z]+/gi,
    value_regex_multiline: /^\d{3}-\d{4}$/m,
  },
  {
    _label: "code",
    description: "JavaScript code type",
    value_code: Code("function greet(name) { return 'Hello, ' + name; }"),
    value_code_with_scope: Code("return x + y;", { x: NumberInt(10), y: NumberInt(20) }),
  },
  {
    _label: "min_max_key",
    description: "MinKey and MaxKey sentinel types",
    value_min_key: MinKey(),
    value_max_key: MaxKey(),
  },
  {
    _label: "mixed_realistic",
    description: "Realistic mixed-type document (user profile)",
    user_id: UUID(),
    username: "jdoe_42",
    email: "jdoe@example.com",
    age: NumberInt(34),
    balance: NumberDecimal("1029.50"),
    is_verified: true,
    role: "editor",
    permissions: ["read", "write", "comment"],
    last_login: new Date("2025-04-10T08:22:00Z"),
    created_at: new Date("2021-07-19T00:00:00Z"),
    preferences: {
      theme: "dark",
      language: "en-US",
      notifications: { email: true, sms: false, push: true },
    },
    login_count: NumberLong("482"),
    avatar_bytes: BinData(0, "aW1hZ2VkYXRh"),
    deleted_at: null,
    session_token: /^[A-Za-z0-9+/]{64}$/,
  },
]);

print("[init-db-mongo] collections seeded:");
db.getCollectionNames().forEach(function(name) {
  print("  " + name + ": " + db[name].countDocuments() + " docs");
});
JS

if [[ -f "${ROOT_DIR}/.env" ]]; then
  if grep -q '^DATABASE_URL=' "${ROOT_DIR}/.env"; then
    sed -i.bak "s#^DATABASE_URL=.*#DATABASE_URL=${DATABASE_URL}#g" "${ROOT_DIR}/.env"
    rm -f "${ROOT_DIR}/.env.bak"
  else
    echo "DATABASE_URL=${DATABASE_URL}" >> "${ROOT_DIR}/.env"
  fi
else
  echo "DATABASE_URL=${DATABASE_URL}" > "${ROOT_DIR}/.env"
fi

echo "[init-db-mongo] done. DATABASE_URL=${DATABASE_URL}"
