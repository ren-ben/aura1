-- Sessions under ten minutes were mistaken starts: they are no longer kept.
DELETE FROM "sessions" WHERE "ended_at" - "started_at" < interval '10 minutes';
