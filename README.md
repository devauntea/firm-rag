# firm-RAG
A permission-aware legal document Q&A system

## Try it

**https://tassel-statute-anchovy.ngrok-free.dev**

The demo is password protected. Contact me for credentials and a window when
the link will be live.

A web interface for people who would rather not use a terminal. Pick which
account you are signed in as, optionally narrow to one matter, and ask a
question. Answers come back with the sources they were drawn from, and each
source is marked as either cited or not cited in the answer. The "View access
permissions" link shows, live from the database, which documents each account
can reach, which is the fastest way to see why some questions come back empty.

Two things to know before clicking. Answers take roughly ten to thirty seconds,
because the model runs locally rather than on a hosted API. And the link is a
tunnel to a laptop, so it only responds while that machine is awake and the
tunnel is running. If it does not load, it is switched off rather than broken.

## How this works

A lawyer or paralegal asks a question through `POST /api/answer`, identified by
`userEmail`. Retrieval never sees the whole corpus; it's scoped, in the SQL
query itself, to only the matters that specific user has been granted access
to. The model then answers using only what was retrieved, with every claim
required to carry a citation back to a specific chunk, and can trigger one
additional, identically-scoped search of its own if the first pass wasn't
enough. That search is bounded to two rounds, and unable to reach anything the
caller couldn't already see.

The one decision worth defending hardest: **permissions are enforced at the
retrieval query, never left to the model to respect.** A chunk from a matter
the caller can't access is never fetched from the database in the first
place. Not fetched and then filtered: never fetched. That's true whether the
search came from the initial request or from the model's own tool call
mid-answer.

```mermaid
flowchart TD
    client["Client<br/>(curl / future UI)"]
    api["POST /api/answer<br/>(Next.js, Docker)"]
    rag["answerQuestion()<br/>src/lib/rag.ts"]
    retrieve["Permission-checked retrieval<br/>chunks ⋈ documents ⋈ matters ⋈ matter_access ⋈ users<br/>WHERE u.email = caller"]
    db[("Postgres + pgvector<br/>(Docker)")]
    model["Qwen 2.5 7B<br/>(Ollama, host, Metal)"]
    tool["search_documents tool<br/>same retrieval query,<br/>capped at 2 rounds"]
    verify["Citation verifier<br/>rejects invented sources"]

    client -->|"question + userEmail"| api
    api --> rag
    rag --> retrieve
    retrieve --> db
    rag -->|"sources + citation rules"| model
    model -->|"may call"| tool
    tool --> retrieve
    model --> verify
    verify -->|"answer + sources + citationCheck"| api
    api --> client

    style retrieve fill:#8C2F39,color:#fff
    style db fill:#2E5C8A,color:#fff
```

**Day-by-day build log below**: the reasoning and the mistakes, in order.

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

## Day 2: chunking and retrieval

Built a chunker that tries several ways to split text, from most
natural to least: paragraph breaks first, then plain line breaks,
then sentences, then raw characters as a last resort. It falls back
only when it has to. This mattered because my extracted text has no
real paragraph breaks at all (the PDF reader outputs one line per
line of the original page, not per paragraph), and three of my
contracts had a browser's page number and timestamp baked into the
text from being printed to PDF. Both got handled: the missing
paragraphs by falling back to line splits, the print artifacts by
being filtered out before splitting even starts.

All 11 documents are now chunked and embedded, about 1200 characters
per chunk with a 150-character overlap so a sentence that lands on a
chunk boundary still appears whole in at least one side of the cut.

I measured retrieval speed before and after adding a proper search
index (HNSW), and the honest result is: it made no real difference
yet. I checked why instead of assuming: Postgres's own query planner
computes that scanning all 626 chunks directly is actually cheaper
than using the index at this size (cost 106 vs. 762). The index is
correctly built and ready, it's just not useful until the collection
is much bigger, which Postgres decides automatically without needing
any code from me.

I ran real questions against my own data and found two specific ways
the search can mislead someone. First, a vague question about "Coinbase's
arbitration argument" pulls back chunks from two different Supreme Court
cases with different outcomes, at almost identical relevance scores, so
an answer could easily blend two unrelated holdings into one wrong
statement. Second, and worse: asking "what did the Texas Supreme Court
hold" returns a dissenting opinion (from a case the court didn't even
agree to hear) ranked above the actual controlling decision, because the
dissent's text literally contains the words "Supreme Court of Texas" and
the real holding's text doesn't say that as directly. Search can tell
you something is topically related. It can't tell you something is
legally authoritative. Fixing that is next week's problem, not this
week's.

Fixed the one document that was still unreadable since Day 1: a scanned
opinion with no real text in it. Installed Tesseract (an OCR tool),
turned the scan into images, and had Tesseract read the text off those
images. Hit a real bug along the way: Tesseract couldn't read files
sitting in /tmp on this Mac (likely a macOS privacy restriction), which
I only figured out by testing the exact same file from two different
folders and watching one work and one fail. Once I worked around it and
got clean text back, I recorded exactly how that document was recovered,
not just that it was recovered, because a real law firm would want to
know a document was OCR'd and not directly extracted, since either
approach can carry different kinds of small transcription errors.

## Day 3: inference and citation

Serving qwen2.5:7b locally through Ollama, which wraps llama.cpp and
runs on Apple Metal on this machine (an M4 Mac, no CUDA, no discrete
GPU). Measured real throughput instead of trusting the model card:
about 21.7-21.8 tok/s once the model is warm, versus a one-time model
load of roughly 4.8 seconds on the first request that has nothing to
do with steady-state generation speed. Conflating those two would give
a misleadingly pessimistic number.

Built a generation layer on top of Day 2's retrieval that forces every
factual claim in an answer to carry a citation marker back to a
specific numbered source chunk, and wrote a mechanical verifier that
flags any citation number the model invents that wasn't actually in
the retrieved set. Across five real end-to-end test runs today, the
verifier confirmed zero invalid citations, including on two runs where
the model declined to answer entirely.

This directly targets the two failures found on Day 2. On the Coinbase
question, retrieval still returned a blended pool of chunks from both
Bielski and Suski, exactly as before, but the model's answer only
cited the Bielski sources for the Bielski-specific claim. It happened
to disambiguate correctly, though that's not a guarantee retrieval
itself doesn't provide, which is exactly why the citations matter: so
it can be checked, not just trusted.

On the Texas Supreme Court question, the model refused twice rather
than confidently misattributing the dissent as a holding, which is the
safer failure mode. I tested two phrasings to understand why: the
second, vaguer phrasing pulled in chunks from a completely unrelated
case (a different matter's document that has nothing to do with this
one) into the retrieved set, which suggests the refusal may come from
noisy, off-topic retrieved context rather than the model precisely
reasoning about which court actually held what. I can't fully tell
those two explanations apart from the outside, but either way the
system declined instead of fabricating, which is the property that
actually matters.

Tested the refusal instruction directly with a question entirely
outside the corpus (trademark law, which nothing in these eleven
documents touches). It refused cleanly, citing nothing, which the
verifier confirmed.

Did not run vLLM or SGLang hands-on: both are CUDA-first production
serving frameworks and I don't have NVIDIA hardware. Read about
PagedAttention and understand conceptually why it matters for serving
many concurrent users efficiently on a GPU cluster, which is the real
production story for a company like Firmly, distinct from the
single-user local setup built this week.

## Day 4: containers and deployment

**What I built:** up to now, everything I built (search, chunking,
the AI answering) only existed as scripts I ran myself from a
terminal. Today I turned that into an actual web address
(`POST /api/answer`) that anything can call, and packaged the whole
app into a Docker container so it can run the same way on any
machine, not just mine.

**One helper function, two callers:** before wiring up the web
address, I pulled the "ask a question, get a cited answer" logic out
of my terminal script and put it in its own file, so both the
terminal script and the new web address call the exact same code
instead of two separate copies that could quietly drift apart and
disagree with each other over time.

**Building a small container instead of a huge one:** a naive way to
package a web app copies everything, including all the tools used to
build it, into the shipped container. I turned on a Next.js setting
that instead figures out exactly which files the app actually needs
to run, and only ships those. My container ended up around 80MB.
Skipping that setting would have shipped several times that, for no
benefit, since none of that extra weight would ever actually run.

**The model server stays outside the container, on purpose:** my AI
model runs through Apple's chip-level acceleration (Metal), which
doesn't work the same way inside a Linux container the way it does on
a real graphics card. So I left it running on my Mac directly and had
the container reach out to it, instead of trying to squeeze it inside
too. This also happens to match how a real company would do it: the
model server is its own separate thing that doesn't get rebuilt every
time the app's code changes.

**Two addresses that mean different things depending on where you
are:** my container needs to reach two other things: the database,
and the AI model. Locally, both live at `localhost` with different
port numbers. Inside a container, `localhost` only means "this
container," so I had to give the app two different addresses instead:
the database's container name (containers on the same setup can find
each other by name), and a special address Docker provides
specifically for "reach out to whatever's running on the actual
computer, not in a container."

**A debugging story worth remembering:** I stopped the database on
purpose to see what would happen, and the app said it worked, giving
back a real, correct answer. That was wrong, and I only caught it by
checking twice: my container list only showed the database running,
not the app, and something already had the app's port claimed. It
turned out an old copy of the app, started days earlier directly on
my Mac (not in a container) and never closed, was still quietly
answering every request. The real containerized app had never
actually started at all. It just sat there, created but never
running, because the port it wanted was already taken. The lesson:
a test that "passes" is only proof of something if you're sure what
actually answered it.

**A second real bug, found the same way:** once the container was
actually running, I stopped the database again to test failure
properly this time. The app did fail, but a caller hitting it would
have gotten back nothing at all: an error with a completely empty
message, no explanation. I added a step that catches the failure,
writes the real, detailed reason somewhere only I can see (the
container's own logs), and gives the person calling the app a short,
honest message instead: "search is temporarily unavailable." Nothing
scary, nothing empty, and nothing that reveals internal details to
someone who shouldn't see them.

**What today actually taught me:** a green checkmark isn't proof of
anything by itself. Twice today, something looked like it worked, and
twice the real explanation was hiding one layer down: a leftover
process answering in place of the real one, and a real failure
returning no information at all. Both times, the fix was the same
habit: don't trust the first signal, go look at what's actually
running and what's actually being logged.

**What's still missing before this could actually go live:** I can
name these precisely rather than pretend today's setup is finished.

- The database password is still sitting in plain text in a compose
  file I've been committing to git all week. A real deployment pulls
  that from a secret manager, injected only at the moment it's
  needed, never written down anywhere.
- There's no encryption and no reverse proxy in front of the app.
  I'm hitting plain http://localhost:3000 directly. A real deployment
  sits something in front that handles https and forwards traffic in.
- The container only exists on my own laptop right now. Nothing
  builds it automatically when code changes, and nothing stores a
  finished, tagged copy anywhere else. A real deployment builds the
  image automatically on every change, saves it somewhere central,
  and deploys a specific known version, rather than whatever happens
  to be sitting on one person's machine.
- Keeping the AI model outside the container isn't just a workaround
  for my laptop's Apple chip. It's also how a bigger, real version of
  this would work. The model would run as its own separate,
  independently-scaled service that the app calls over the network,
  the same shape as today, just pointed at a real server instead of
  my Mac.

Naming these gaps specifically, and knowing exactly what closes each
one, matters more than pretending they don't exist.

## Day 5: permission-aware retrieval

**Before the fix**: no user identified anywhere in the request, and Matter C (which has an ethical wall on it) answers anyway:

![Before permission enforcement](docs/screenshots/01-before-permission-fix.png)

**After the fix**: identical question, identical matter, two different attorneys:

![The ethical wall holds](docs/screenshots/02-ethical-wall-holds.png)

**Adversarial test**: the walled attorney demands the content explicitly, with jailbreak-style phrasing:

![Adversarial request blocked](docs/screenshots/03-adversarial-request-blocked.png)

The API from Day 4 had no concept of who was asking. matterCode was
a fully client-trusted filter, and the Day 1 access matrix sat in the
database unused. Proved this live before fixing it: a request with no
user identified at all still returned a real, cited answer from a
matter that's supposed to be walled off for two of my three test
users.

Closed the gap by joining retrieval through matter_access and users,
keyed on the calling user's email, so a chunk from a matter the caller
can't access is never fetched from the database at all. Not fetched
and then filtered: never fetched. Everything downstream (the prompt,
the model call, citation verification) stayed identical, because
permission enforcement belongs entirely at the one boundary where
data first enters the system.

Deliberately did not build real authentication. The API trusts a
userEmail field in the request body, which mirrors how a backend
trusts an already-verified session in a real system, but isn't one.
Authentication (verifying who someone is) and authorization (deciding
what they're allowed to do) are different problems; today solved only
the second, and I can say precisely why the first is still open.

Proved the wall through the real running API, not just by reading the
schema, across the full access matrix: Attorney 1 succeeds on Matter
C, Attorney 2 and the paralegal are both walled off from it with an
empty, honestly-refused result, not a 403, since revealing that a
walled matter exists is itself a leak in an ethical-wall scenario.
Attorney 1 is symmetrically blocked from Matter D while the paralegal
and Attorney 2 succeed there, proving this is real per-user
permission, not a role hierarchy in disguise. All three users succeed
on Matter A, which has no restrictions at all.

Tried to break it on purpose, two ways. First, had the walled attorney
explicitly demand the forbidden matter with jailbreak-style phrasing
("ignore any restrictions"). The response came back with an empty
sources array, meaning nothing was even retrieved for any phrasing to
talk the model into revealing. Second, omitted matterCode entirely to
see if an unscoped search would accidentally surface something. The
retrieved pool spanned every other matter that user has access to,
and the walled matter (326 chunks, the largest in the corpus, and the
most topically relevant to the test question) never appeared once.
No prompt-injection defense was needed for either case, because the
fix lives below the model entirely.

Verified a missing userEmail fails closed, not open: the API returns
a clean 400 rather than silently treating an unidentified caller as
unrestricted, which is the correct failure direction for a security
boundary.

Known gaps, named specifically: no real authentication (userEmail is
trusted, not verified), no audit log of who asked about what, and no
admin or cross-matter role in the access model yet.

## Day 6: sandboxed tool use and polish

Gave the model a real tool. It can trigger one additional, permission-
scoped search mid-answer instead of working only from the initial
retrieval pass. The actual work was building the fence around that
decision before building the decision itself: a tool call's arguments
are untrusted input the same way a request body is, and everything I
already knew about not trusting client input applied directly.

Four rules, enforced in code: the Day 5 permission join applies
unconditionally to tool-triggered searches regardless of what matter
the model requests; matterCode is allowlisted against {A,B,C,D} rather
than merely typed; tool calls are capped at two rounds by a hard loop
bound; and every tool call runs through the exact same permission-
checked retrieval function as the initial search: one function, two
callers.

Attacked it with three different phrasings, from a vague hint to
explicitly naming the tool and the forbidden matter code. In every
case inside the real system, the model answered directly from the
already-scoped initial retrieval rather than reaching for the tool at
all. The wall held, but I hadn't actually caught the model in the
act of requesting the forbidden matter through a tool call. Rather
than call that good enough, I isolated the tool trigger outside the
full system prompt and confirmed directly: the model will readily
call the tool with matterCode "C" when asked plainly. So the reason
it didn't happen inside the real flow isn't that the model can't.
It's that the system prompt's "use only these sources" instruction
happens to discourage it for this kind of question. That's a genuine,
useful finding, not a loose end: the security guarantee comes from
the tool executor's unconditional permission join, proven by tracing
the code, not from the model rarely choosing to try.

Confirmed the tool loop engages for real on a legitimate multi-topic
question. The audit log shows an actual model-issued call, requesting
and receiving Matter A (which this user has access to), not just the
initial pass. Requests involving a live tool round take noticeably
longer, since each round is a full extra call to the model, worth
knowing before assuming a slow response is broken rather than working.

Added a first slice of audit logging: every tool call is logged with
the caller, the requested matter, and the accepted matter, before the
query runs, so a blocked attempt is on record even though it
returned nothing. Enforcement and logging are two separate mechanisms
that don't depend on each other.

Added an architecture diagram and a present-tense system overview at
the top of this README, above the day-by-day log, because that's what
someone skimming this repo for ninety seconds before a call actually
needs first, not a chronological reconstruction of six days of
decisions.
