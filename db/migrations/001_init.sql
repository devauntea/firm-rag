CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email text NOT NULL UNIQUE,
    display_name text NOT NULL,
    role text NOT NULL,
         CHECK (role IN ('attorney', 'paralegal','admin')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matters (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE, -- 'A', 'B', 'C', 'D'
    name text NOT NULL,
    practice text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matter_access (
    matter_id bigint NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (matter_id, user_id)
);

/*The intuitive model is a role hierarchy: partners see everything,
associates see their practice group, paralegals see less.
That model cannot express an ethical wall.

Access to a matter is a fact about the pair (user, matter)
*/

CREATE TABLE IF NOT EXISTS documents (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    matter_id bigint NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    filename text NOT NULL UNIQUE,
    title text NOT NULL,
    seq int NOT NULL,
    page_count int,
    char_count int NOT NULL DEFAULT 0,
    raw_text text,
    extraction_status text NOT NULL DEFAULT 'pending',
       CHECK (extraction_status IN ('pending','ok','empty','error')),
    extraction_note text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_matter_idx ON documents (matter_id);

/*WHY EXTRACTION_STATUS?
when dealing with multiple types of documents, we need to know if the extraction was successful.
There is a possiblity of a document being skipped, or the extraction being empty.
(in the case of the doc being a scan)

Skipping quietly is how RAG systems lie. The document is in the corpus, a lawyer believes it's searchable,
and it is silently absent from every answer the system gives. We need to know when a document is skipped,
so we can investigate and fix the problem.
*/

CREATE TABLE IF NOT EXISTS chunks (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    matter_id bigint NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    ordinal int NOT NULL,
    content text NOT NULL,
    token_count int,
    embedding vector(768),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (document_id, ordinal)
);

CREATE INDEX IF NOT EXISTS chunks_matter_idx   ON chunks (matter_id);
CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks (document_id);

/*WHY MATTER_ID IS ON CHUNKS WHEN IT'S ALREADY ON DOCUMENTS?
consistency risk: if a document ever moved to a different matter, the chunks would need updating too.
I denormalized for the security-critical query path and here's how I'd keep it consistent.
*/