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
cited the Bielski sources for the Bielski-specific claim - it happened
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

Did not run vLLM or SGLang hands-on - both are CUDA-first production
serving frameworks and I don't have NVIDIA hardware. Read about
PagedAttention and understand conceptually why it matters for serving
many concurrent users efficiently on a GPU cluster, which is the real
production story for a company like Firmly, distinct from the
single-user local setup built this week.

## Day 4: containers and deployment (in progress)

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
actually started at all - it just sat there, created but never
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
twice the real explanation was hiding one layer down - a leftover
process answering in place of the real one, and a real failure
returning no information at all. Both times, the fix was the same
habit: don't trust the first signal, go look at what's actually
running and what's actually being logged.
