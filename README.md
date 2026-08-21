# firm-RAG
A permission-aware legal document Q&A system

## Day 1: the database

**What I built:** Postgres running in Docker, with an extension called
pgvector added on top. Normally a project like this uses two separate
databases: one regular database for things like users and permissions,
and a second, special "vector database" for the AI search part. I used
one database for both, on purpose.

**Why one database instead of two:** Permission rules (who's allowed to
see what) live in the regular database. If the document search lived
somewhere else, there'd be two ways to keep someone out of a document
they shouldn't see, and both are worse:

- Search everything, then hide the results the user isn't allowed to
  see. The problem: the forbidden stuff was still pulled up and read
  into memory before it got hidden, so it can still leak through a
  bug, a log file, or a crash report.
- Keep a second copy of the permission rules next to the search index,
  and keep both copies in sync. The problem: two copies of the truth
  always drift apart eventually, and the day they do, someone sees a
  document they shouldn't.

Putting search and permissions in the same database means a single
question, "find documents like this one," and a single rule, "that
this user is allowed to see," get answered together, in one step. A
document you're not allowed to see is never pulled up in the first
place, not pulled up and then hidden.

**How access control works:** Instead of giving each person a role like
"attorney" or "paralegal" and assuming that decides what they can see,
I built a simple list of "this person can see this specific case."
Law firms have a real rule called an *ethical wall*: sometimes one
attorney is blocked from one specific case, even if a colleague at the
exact same level can see it, because of a conflict of interest. A
"role" can't express that (two attorneys, same role, different access).
A list of individual permissions can. The wall is just a permission
that was never added.

**What happens when a document can't be read:** One of my 11 test
documents is a scanned PDF with no actual text in it, just an image.
Instead of quietly skipping it, the system records it as "couldn't
read this one" and says why. The alternative, skipping it silently,
means the system looks complete while secretly missing a document,
and nobody finds out until someone asks about it and gets a wrong or
incomplete answer. A visible failure is better than an invisible one.

**What I deliberately didn't do yet:** I didn't add a search-speed
optimization called an index. With only a handful of documents, search
is already fast, so there's nothing to speed up yet. Adding it now
would mean guessing at a benefit I can't measure. That's tomorrow's
job, once there's a real slow query to compare against.
