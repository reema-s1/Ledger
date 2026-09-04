-- Landing screen: a stub login path (Section 6's "user_id stands in for
-- real auth" simplification stays true — this just gives a reviewer a
-- username/password to type instead of editing a query param by hand).

ALTER TABLE users ADD COLUMN username text UNIQUE;
ALTER TABLE users ADD COLUMN password_hash text;
