# Foundation review — is the ground safe to build on?

Type: task
Status: claimed

## Question

A scoped review of only the pieces the smart layer will sit on: the two chat backends
(`/api/chat`, `/api/workspaces/[id]/chat`), auth on those routes, transcript / workspace /
document storage, the citation-anchor machinery (`workspace_doc_blocks`), and the seams
named in `foundations.md`. Output: what is sound to build on, what must be fixed first
(each with severity), and nothing else — this is NOT a general audit (ruled out of scope on
the map). Findings that demand fixes become facts the architecture ticket (08) plans around.
