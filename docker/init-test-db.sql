-- Runs once, when the Postgres volume is first created.
-- Tests use their own database so they can wipe tables freely without touching dev data.
CREATE DATABASE movie_memory_test;
