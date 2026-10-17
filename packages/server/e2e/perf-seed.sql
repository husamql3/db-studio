-- Seed for e2e/perf.ts: a 2M-row `orders` table with every grid cell variant, the 50k
-- `customers` it references, and 40 small lookup tables so the sidebar lists a realistic
-- number of tables. Load it into a disposable database:
--
--   docker exec db-studio-pg psql -U dbstudio -c "CREATE DATABASE dbstudio_perf"
--   docker exec -i db-studio-pg psql -v ON_ERROR_STOP=1 -U dbstudio -d dbstudio_perf < e2e/perf-seed.sql

CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'refunded', 'cancelled');

CREATE TABLE customers (
	id SERIAL PRIMARY KEY,
	name TEXT NOT NULL,
	email TEXT NOT NULL,
	country TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL
);
INSERT INTO customers (name, email, country, created_at)
SELECT 'Customer ' || g, 'customer' || g || '@example.com',
	(ARRAY['US', 'DE', 'EG', 'FR', 'JP', 'BR', 'IN', 'GB'])[1 + g % 8],
	TIMESTAMPTZ '2020-01-01' + (g || ' minutes')::interval
FROM generate_series(1, 50000) g;

CREATE TABLE orders (
	id BIGSERIAL PRIMARY KEY,
	customer_id INT NOT NULL REFERENCES customers (id),
	status order_status NOT NULL,
	total NUMERIC(12, 2) NOT NULL,
	is_gift BOOLEAN NOT NULL,
	note TEXT,
	shipping JSONB,
	placed_at TIMESTAMPTZ NOT NULL,
	ship_date DATE,
	tags TEXT[],
	sku TEXT NOT NULL,
	quantity INT NOT NULL
);
INSERT INTO orders (customer_id, status, total, is_gift, note, shipping, placed_at, ship_date, tags, sku, quantity)
SELECT 1 + g % 50000,
	(ARRAY['pending', 'paid', 'shipped', 'refunded', 'cancelled']::order_status[])[1 + g % 5],
	round(((g::bigint * 7919) % 100000) / 100.0, 2),
	g % 7 = 0,
	CASE WHEN g % 3 = 0 THEN NULL ELSE 'Order note number ' || g || ' with some longer descriptive text to wrap' END,
	jsonb_build_object('carrier', (ARRAY['dhl', 'ups', 'fedex'])[1 + g % 3], 'zip', lpad((g % 99999)::text, 5, '0'), 'express', g % 2 = 0),
	TIMESTAMPTZ '2021-01-01' + (g || ' seconds')::interval,
	DATE '2021-01-01' + (g % 1500),
	ARRAY['tag' || (g % 10), 'tag' || (g % 13)],
	'SKU-' || lpad((g % 100000)::text, 6, '0'),
	1 + g % 9
FROM generate_series(1, 2000000) g;

DO $$
BEGIN
	FOR i IN 1..40 LOOP
		EXECUTE format('CREATE TABLE lookup_%s (id SERIAL PRIMARY KEY, label TEXT NOT NULL, value INT NOT NULL)', lpad(i::text, 2, '0'));
		EXECUTE format('INSERT INTO lookup_%s (label, value) SELECT ''label '' || g, g FROM generate_series(1, %s) g', lpad(i::text, 2, '0'), i * 500);
	END LOOP;
END $$;

VACUUM ANALYZE;
