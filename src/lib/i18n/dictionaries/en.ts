// English UI strings (default locale). The shape of this object IS the Dictionary type;
// he.ts must match it exactly, so adding a key here forces a Hebrew translation.
//
// NOTE: `brand` is the product name — "Atlas" (Hebrew UI shows the transliteration אטלס).
export const en = {
  common: {
    brand: 'Atlas',
    menu: 'Menu',
    search: 'Search',
    loading: 'Loading…',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
    back: 'Back',
    today: 'Today',
    yesterday: 'Yesterday',
    all: 'All',
    add: 'Add',
    remove: 'Remove',
    more: 'More',
    edit: 'Edit',
    copied: 'Copied',
    share: 'Share',
    retry: 'Retry',
    /** A button's label while its request is in flight. */
    working: 'Working…',
    error: 'Something went wrong',
    empty: 'Nothing here yet',
    comingSoon: 'Coming soon',
    quickAccess: 'Quick access',
    // Shown INSTEAD of a raw 401 body. The server says "unauthorized"; that is
    // not something to put in front of a user, and it hides the one action that
    // fixes it.
    sessionExpired: 'Your session has expired.',
    signIn: 'Sign in',
  },
  nav: {
    product: 'Product',
    enter: 'Sign in',
    home: 'Home',
    calendar: 'Calendar',
    search: 'Search',
    chat: 'Chat',
    company: 'Company',
    companies: 'Companies',
    live: 'Live',
    topics: 'Topics',
    saved: 'Saved',
    workspaces: 'Workspaces',
    watchlists: 'Watchlists',
    releaseNotes: 'Release notes',
    helpSupport: 'Help & support',
    profile: 'Profile',
    settings: 'Settings',
    collapseSidebar: 'Collapse sidebar',
    workspace: 'Workspace',
    agents: 'Agents',
  },
  workspace: {
    title: 'Workspaces',
    subtitle:
      'Each workspace is one company analysis — its own files, agents, and history. Open one or start fresh.',
    newWorkspace: 'New workspace',
    newWorkspaceHint: 'Name it and start adding files',
    files: 'files',
    fileOne: 'file',
    searchPlaceholder: 'Search workspaces…',
    sortNewest: 'Newest',
    sortUpdated: 'Last updated',
    sortName: 'Name',
    sortFiles: 'File count',
    untitled: 'New workspace',
    emptyHead: 'Nothing open yet.',
    emptyBody: 'A workspace is one company or sector — its files, agents, and history, in one place.',
    emptySearchHead: 'No matches',
    emptySearchBody: 'No workspaces match “{q}”.',
    backToWorkspaces: 'Back to workspaces',
    backToFiles: 'Back to files',
    intakeHead: 'What are we working on today?',
    intakeSub: 'Describe the company or material you want — Atlas will search what it has.',
    intakePlaceholder: 'Describe the files or material you want to work on…',
    // Was "Type / for skills, @ to mention a company" — neither existed. A hint
    // that teaches a gesture the app does not have is the same class of untruth
    // as a fabricated result, just quieter.
    intakeHint: 'Hebrew or English. Name a company, a period, or both.',
    intakeSend: 'Send',
    intakeAdd: 'Attach',
    intakeMic: 'Dictate',
    // The intake is a CONVERSATION now, so most of its copy comes from the model
    // in the user's own language. What is left here is the chrome around it:
    // what Atlas is doing, and what to say when it cannot answer at all.
    intakeThinking: 'Thinking…',
    intakeAdding: 'Pulling the files in…',
    // ATLAS ANSWERS THE YES. Founder, 2026-08-04: *"more human. if the user says
    // yes pull them -> he should respond 'great, im pulling them it can take a
    // second…'"*. Said by the CLIENT, not the server: the whole point of the
    // bare-agreement shortcut is that this turn costs no model call, and asking
    // a model to compose "great, pulling them" would hand back the half-second
    // it just saved.
    intakePullingNow: 'Great — pulling them in now. It can take a second…',
    // Said as a turn in the thread, not as a banner. Honest about WHY there is
    // no answer, and it asks for the retry rather than silently offering
    // something worse — the previous copy claimed "keyword matches", which the
    // conversation no longer shows.
    intakeNotInterpreted: 'I could not work that out just now — my model did not answer. Try again?',
    // NOTHING WAS SELECTED, SO NOTHING WAS ATTACHED — and this says exactly that
    // and nothing more. It replaces `intakeNotInterpreted` on this path, which
    // was the wrong cause: the model answered, so "I could not work that out"
    // blamed a failure that did not happen. `rules/app.md` forbids inventing a
    // cause, and a wrong one is worse than a generic one because the analyst
    // acts on it — here they would retry an unchanged request.
    intakeSelectionUnclear:
      "I didn't end up with a file to add, so I've added nothing. Tell me which ones you want and I'll bring them in.",
    // THE MODEL'S PROSE AND ITS IDS DISAGREED. Said as the disagreement it is,
    // because that is something the analyst can settle in one sentence — and
    // because picking one half silently is what reverted a narrowing they had
    // explicitly asked for.
    intakeSelectionConflict:
      "I read that as narrowing the list, but what came back was still all of them — so I've added nothing rather than guess. Which ones should I bring in?",
    // COVERAGE FAILURES, SAID OUT LOUD. Without these the panel would show a
    // list drawn only from Atlas's own library and nothing would tell the
    // analyst that MAYA was never reached — an answer that looks complete and
    // is not.
    intakeMayaUnreachable:
      "I couldn't reach MAYA just now, so this only covers what Atlas already holds. Worth trying again in a moment.",
    intakeUnknownCompany:
      "I don't have a TASE issuer under that name. I can only find companies that have announced a reporting date.",
    intakeRequestNotUnderstood:
      "I couldn't work out which company you meant well enough to search MAYA, so this covers only what Atlas already holds. Try naming the company and the period?",
    intakeFetching: 'Fetching from MAYA — downloading and reading the file…',
    intakeSearchFailed: 'That did not go through: {error}',
    buildingTitle: 'Setting up the workspace…',
    // A partial fill must be visible. Silently landing 3 of 5 files is exactly
    // the failure this chapter exists to remove.
    intakeAttachFailed: 'Could not add {n} of them: {error}',
    intakeContinueAnyway: 'Open the workspace',
    notFound: 'This workspace is no longer here.',
    // Was "workspaces live for the session only — a page reload clears them",
    // which stopped being true at migration 016. Workspaces persist now, so the
    // honest reasons it is not here are deletion or ownership: RLS makes
    // another account's workspace NOT THERE rather than forbidden, and this
    // screen is what that looks like.
    notFoundHint: 'It may have been deleted, or it belongs to a different account.',
    allWorkspaces: 'All workspaces',
    collapsePanel: 'Collapse panel',
    expandPanel: 'Show panel',
    renameWorkspace: 'Rename workspace',
    newWorkspaceChat: 'New workspace chat',
    yourWork: 'Your work',
    workspaceSection: 'Workspace',
    sectionFiles: 'Workspace files',
    sectionAgents: 'Agents used',
    sectionActions: 'Actions taken',
    sectionChats: 'Chats',
    docDraftMeta: 'Draft',
    legalTitle: 'Legal Due-Diligence',
    legalSub: 'Deploy a legal agent across every file',
    legalScopePrompt: 'Anything specific it should look for? Leave blank for a full review.',
    legalScopePlaceholder: 'e.g. focus on the Haifa port concession and any change-of-control clauses…',
    legalRun: 'Run review',
    legalRunning: 'Running review…',
    legalDoneSub: '{n} findings',
    legalReviewTab: 'Legal review',
    legalFullReview: 'Full review — no scope narrowing',
    legalScopeLine: 'Scope: {areas}',
    noTabsHead: 'Nothing open',
    noTabsBody: 'Open a file from Workspace files, or start the document.',
    docToolHeading: 'Heading',
    docToolBold: 'Bold',
    docToolItalic: 'Italic',
    docToolBullet: 'Bulleted list',
    docToolQuote: 'Quote block',
    docToolCite: 'Cite a source',
    // ── Atlas writing into the document ──────────────────────────────────────
    docLetAtlasWrite: 'Let Atlas write',
    docWritePlaceholder:
      'Tell Atlas what to write — "open with the industry, then the board, then why this is a good investment"',
    docWriting: 'Atlas is writing…',
    docWriteFailed: 'Atlas could not write that: {error}',
    // The loudest string in the workspace, on purpose: everything typed after
    // this point is not being kept, and silence would be the worst possible
    // answer to that.
    docSaveFailed: 'Your document is NOT being saved: {error}',
    connectQuote: 'Quote it',
    docWriteNoAnswer: 'Atlas could not draft that just now. Try again?',
    // The background write — reported where the analyst already is, never by
    // moving them into the document (founder, 2026-08-05).
    docWorking: 'Atlas is writing it into your document',
    docWorkingClip: 'Atlas is reading the clipping',
    docIncoming: 'Atlas is adding to this document',
    docAdded: 'Added to your document',
    docFailed: 'Atlas could not add that. Try again?',
    docOpen: 'Open',
    docEmptyHint: 'Write here — or tell Atlas what to draft, and edit what it gives you.',
    // Marked text anywhere in the workspace can be worked into the document.
    connectToDocument: 'Connect to document',
    connectPlaceholder: 'Where should this go, and how?',
    connectTo: 'Adding to your document',
    docContinue: 'Continue this section',
    docQuoteDemo:
      'The quoted passage, its speaker and the figures in this document are invented for the demo — nothing here comes from a real filing or call.',
    docExport: 'Export',
    docExportPdf: 'Export as PDF',
    docExportWord: 'Export as Word',
    // Serves BOTH export rows — neither format is implemented this chapter.
    docExportUnavailable: 'Not in this build',
    docCitations: '{n} citations',
    docContinueInserted: 'Sample continuation — no model wrote this.',
    // The toggle names the state it takes you TO. "Split view" named neither
    // state, on a control whose icon named nothing at all.
    untitledDocument: 'Untitled document',
    docTitleLabel: 'Document title',
    docTitleFailed: 'The document title did not save: {error}',
    // "up to three", not "all open files": the panes are capped at
    // lib/workspace/panes.MAX_PANES, and a control must not promise a screen it
    // will not produce.
    multiView: 'Multi-view — up to three files side by side',
    singleView: 'Single view — one file at a time',
    addToSplit: 'Show in multi-view',
    // Shown once the panes are full: the click still works, and this is what it
    // costs. {n} is the cap (lib/workspace/panes.MAX_PANES).
    addToSplitFull: 'Show in multi-view — {n} at a time, so the oldest pane closes',
    removeFromSplit: 'Hide from multi-view',
    hidePane: 'Hide from multi-view — the tab stays open',
    resetSplit: 'Reset widths',
    workspaceChat: 'Workspace chat',

    // ── Derived at render from persisted rows (migration 016) ──────────────
    // A workspace's company is DERIVED from its sources, never stored: one
    // workspace is about Tigbur, another is about three companies at once, and
    // a stored column could not represent the second without lying.
    companyNone: 'Untitled',
    companyMany: '{n} companies',
    // Both locales inflect at one: "1 sources" / "1 מקורות" would ship to the UI.
    sourceOne: '1 source',
    sourceMany: '{n} sources',

    // A citation must never render as a working link when it is not one.
    // `drifted` is the dangerous case: the anchor still resolves, but the
    // transcript was re-processed and the line now holds different words.
    citationDrifted: 'The source moved — this quote is no longer at that line',
    citationAbsent: 'The source was removed from this workspace',

    // Failures are RENDERED. An empty grid and a failed query must never look
    // the same, and a create that did nothing must not leave a silent button.
    loadFailed: 'Could not load your workspaces — {error}',
    createFailed: 'Not saved — {error}',
    openFailed: 'Could not open this workspace — {error}',
    // The pane moved on screen but the change did not reach the database, so
    // it will NOT survive a reload. Saying so beats a workspace that quietly
    // forgets.
    layoutFailed: 'This layout will not be remembered — {error}',
    // The name on screen is REVERTED when this shows. A rename that failed must
    // not leave the new name sitting there looking saved.
    renameFailed: 'The name was not changed — {error}',

    // ── Putting a real source on the shelf ─────────────────────────────────
    // ── a source pane showing the REAL file ──────────────────────────────────
    sourceLoading: 'Opening…',
    sourceFailed: 'Could not open this file: {error}',
    // Each of these is a real row with no words behind it. They say which,
    // rather than rendering an empty page that reads like an empty filing.
    sourceProcessing: 'This call is still being transcribed. Its text will appear here once it is ready.',
    sourceNoText: 'Atlas holds this file, but no readable text has been extracted from it yet.',
    sourceGone: 'The source this was attached to is no longer in the archive.',
    sourcePage: 'Page {n}',
    sourceSelectHint: 'Select any passage to quote it, or to ask Atlas about it.',
    // "Add a document", singular and conversational — the same asking that
    // filled the workspace, not a second browse-and-tick surface beside it.
    // ── workspace chat, which is also Ask Atlas ──────────────────────────────
    // Second line of the serif hero — the first line is shared with the in-call
    // Ask Atlas (`live.askHeroLine1`), so the two greetings read as one feature.
    chatHeroLine2: 'about this workspace',
    chatConnected: 'Atlas is reading the files on this shelf.',
    chatHead: 'Ask about this workspace',
    // Says WHERE another file would come from. "Bring another one in" was read as
    // "fetch it from anywhere", which is the expectation the 2026-08-06 MAYA
    // answer then confirmed in words (see lib/workspace/chat/prompt.ts).
    chatHint:
      "Questions, comparisons, figures across the files here — or ask me to bring in another from Atlas's library.",
    chatPlaceholder: 'Ask Atlas…',
    chatNoAnswer: 'I could not answer that just now — my model did not come back. Try again?',
    chatFailed: 'That did not go through: {error}',
    // Never omitted when it applies: an answer drawn from part of a long
    // transcript reads exactly like one drawn from all of it.
    chatPartial: 'I could only read part of these, so this answer may be incomplete:',
    askAtlas: 'Ask Atlas',
    addDocument: 'Add a document',
    addDocumentHint: 'Describe what you need and I will pull it in — a call, a report, a quarter.',
    addSources: 'Add sources',
    addSourcesHint:
      'Pull in investor calls and company documents. Everything you add stays in this workspace.',
    searchSources: 'Search calls and documents…',
    sourceAdded: 'Added',
    noSources: 'No calls or documents are available yet.',
    noSourceMatch: 'Nothing matches that search.',
    sourcesFailed: 'Could not load the available sources — {error}',
    attachFailed: 'Could not add that source — {error}',
    doneAdding: 'Done',
    // A clip that was captured but cannot be sent. Said out loud, because the
    // alternative is a chip in the composer for an image the server dropped.
    // The word after the quarter on a tab chip: "Q1 2026 · Transcript".
    tabKinds: { transcript: 'Transcript', document: 'Report' },
    closeTab: 'Close tab — the file stays on the shelf',
    playRecording: 'Play the recording',
    snipTooLarge: 'That clipping is too large to send — try a smaller area.',
    snipFailed: 'That clipping could not be captured. Try again.',
    // NOT `live.snip` ("Snip to chat"), which stays true in a live call: here a
    // clipping is asked where it goes, so the tool cannot name one destination.
    snipTool: 'Clip an area',
    // Where a fresh clipping goes: a question to Atlas, or evidence in the document.
    clipWhere: 'Where should this clipping go?',
    clipToChat: 'Ask Atlas',
    clipToDocument: 'Put in the document',
    clipDiscard: 'Discard the clipping',
    clipPage: 'page {page}',
    clipAdded: 'Added to your document',
    // The three answers the founder named, written as INSTRUCTIONS because a
    // chip fills the box rather than firing — what will happen stays readable.
    clipAsImage: 'As an image',
    clipAsText: 'Extract the data as text',
    clipAsTable: 'Make a table from it',
    clipNotePlaceholder: 'Or tell Atlas what to do with it…',
    clipDoIt: 'Let Atlas do it',
    // Second step of the clipping card, reached only by choosing the document —
    // so the question narrows from "where does this go" to "in what form".
    clipHow: 'How should it go in?',
    clipBack: 'Back',
    // The three panel sections that no backend fills yet. They replaced invented
    // agents, threads and activity on 2026-08-06 — "not built" said plainly is
    // the honest state, and it is what the DemoBanner used to stand in for.
    agentsEmpty: 'No agent has run in this workspace. Agents are not wired up yet.',
    // WAS "Ask Atlas conversations are not kept yet", which stopped being true
    // the day the conversation started persisting. An empty state describes what
    // is missing NOW, so it goes stale the moment the feature lands.
    chatsEmpty: 'Nothing has been asked in this workspace yet. Your conversation is saved once you do.',
    actionsEmpty: 'Nothing has happened here yet. This workspace does not keep an activity log yet.',
    /** The one conversation a workspace keeps (v1), in the Chats list. */
    chatMessages: '{n} messages',
    chatMessageOne: '1 message',
    // A clipping's image is not stored — thread.ts explains why. The turn still
    // says what it was asked about, because a silent gap would read as a
    // question that never had a picture attached.
    clipsNotKept: '{n} clippings · page {pages} — the images are not kept',
    clipNotKept: '1 clipping · page {pages} — the image is not kept',
    chatSaveFailed: 'This conversation could not be saved — {error}',

    // ── Destructive confirmations ─────────────────────────────────────────
    // Every line states what will be destroyed BEFORE it is (rules/db.md).
    deleteWorkspace: 'Delete workspace',
    deleteWorkspaceTitle: 'Delete {name}?',
    deleteWorkspaceIrreversible: 'This cannot be undone.',
    deleteCountFiles: '{n} sources on the shelf',
    deleteCountFileOne: '1 source on the shelf',
    deleteCountBlocks: '{n} paragraphs in the working document',
    deleteCountBlockOne: '1 paragraph in the working document',
    deleteCountThreads: '{n} saved conversations',
    deleteCountThreadOne: '1 saved conversation',
    deleteNothingInside: 'It is empty — nothing is stored inside it.',
    confirmDelete: 'Delete',
    removeFile: 'Remove from workspace',
    removeFileTitle: 'Remove {name}?',
    // The file is shared corpus. Taking it off one shelf must not imply Atlas
    // threw it away — it is still findable, and can be added again.
    removeFileBody: 'It comes off this shelf. The file itself stays in Atlas, and you can add it back.',
    removeFileCitations:
      '{n} citations in your working document lose their source. The sentences stay, and each keeps showing what it pointed at.',
    removeFileCitationOne:
      '1 citation in your working document loses its source. The sentence stays, and keeps showing what it pointed at.',
    confirmRemove: 'Remove',
  },
  agents: {
    ready: 'Ready when you are.',
    myAgents: 'My agents',
    scheduledAgents: 'Scheduled agents',
    finishedTasks: 'Finished tasks',
    createAgent: 'Create an agent',
    idle: 'idle',
    running: 'running',
    working: 'working',
    searchPlaceholder: 'Search agents…',
    noMatch: 'No agents match “{q}”.',
    agentProfile: 'Agent profile',
    viewAndEdit: 'View and edit',
    chatWithAgent: 'Chat with agent',
    nothingToDiscuss: 'Nothing to discuss yet — still working',
    createSubtitle: 'Name it, tell it what to do, and point it at something.',
    agentName: 'Agent name',
    namePlaceholder: 'earnings_watcher',
    whatShouldItDo: 'What should it do?',
    taskPlaceholder:
      'e.g. listen to the live call and flag every change in full-year guidance, with the exact quote',
    // The brief asks the UI to encourage detail — more context produces better agents.
    taskHint: 'The more context you give, the better it behaves.',
    assignTo: 'Assign to',
    assignedTo: 'Assigned to',
    optional: 'optional',
    createCta: 'Create agent',
    task: 'Task',
    deleteAgent: 'Delete agent',
    saveChanges: 'Save changes',
    askPlaceholder: 'Ask this agent about its findings…',
    askAgent: 'Ask {name}…',
    answersFrom: '{name} answers from its own findings and the sources behind them.',
    askAnythingOf: 'Ask anything of',
    findingsAndChat: 'Findings & chat',
    profileTab: 'Profile',
    recentAgentChats: 'Recent agent chats',
    chipFound: 'Show me what you found',
    chipReasoning: 'Show your reasoning log',
    chipChangeMind: 'What would change your mind?',
    // Scripted, not generated — the reply carries a demo marker wherever it renders.
    cannedReply:
      'Working from the findings above and the sources behind them — here is what that means in context.',
    scopeWorkspace: 'Workspace',
    scopeCompany: 'Company',
    scopeSector: 'Sector',
    scopeCall: 'Call',
    scopeReport: 'Report',
    noTarget: 'Not assigned',
    expandDock: 'Widen',
    collapseDock: 'Narrow',
    // Agents cannot actually run this chapter — no runtime exists yet.
    chatDisabled: 'Agent replies arrive with the agent runtime.',
  },
  greeting: {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
  },
  home: {
    discoverSubhead: 'Write the company name to discover more about it.',
    searchPlaceholder: 'Search companies…',
    upcomingCalls: 'Upcoming Investor Calls',
    investorCall: 'Investor call',
    liveNow: 'Live Now',
    noLiveNow: 'No live calls right now',
    noUpcoming: 'No upcoming calls',
    activityFeed: 'Activity feed',
    filter: 'Filter',
  },
  calendar: {
    title: 'Calendar',
    allCalls: 'Full market',
    myCalendar: 'My calendar',
    dragHint: 'Drag a call into My calendar to follow it',
    filterHint: 'Filter by type · + adds a type, × removes it · hover any event for its context',
    kindCalls: 'Investor calls',
    kindReports: 'Reports',
    kindWebinars: 'Webinars',
    inCalendar: 'In your calendar',
    ctxKindCall: 'Investor call',
    ctxKindReport: 'Report',
    ctxKindWebinar: 'Webinar',
    addToCalendar: 'Add to my calendar',
    noFollowed: 'You are not following any calls yet',
    noEventsThisMonth: 'Nothing scheduled this month',
    // NAMES THE CAUSE AND THE REMEDY: the grid is empty because the filter is
    // hiding this month's events, not because the month has none — saying the
    // latter was the merge-gating defect this key exists to end.
    // ⚠ RENAMED FROM `allTypesHidden`, AND THE NAME MATTERED. That key said
    // "every event type is switched off", which is only true in one of the two
    // cases that reach here: a month whose events are ALL of a single
    // filtered-away kind is hidden with a chip still switched on. Copy that
    // narrates the wrong cause is the same defect class as copy that denies it.
    monthHiddenByFilter:
      "This month's events are all hidden by the type filter — turn a type back on to see them.",
    // ⚠ THE `Mine` PAIR EXISTS BECAUSE A SCOPED VIEW NEEDS A SCOPED SENTENCE.
    // In "My calendar" the month is measured over FOLLOWED calls only, so the
    // two strings above — which speak about the schedule itself — are false
    // whenever the month holds events the analyst does not follow. Naming the
    // scope is the fix; suppressing the message in that mode was the previous
    // behaviour and it traded a false sentence for an ambiguous blank.
    noEventsThisMonthMine: 'Nothing in your calendar this month',
    monthHiddenByFilterMine:
      "Your calendar's events this month are all hidden by the type filter — turn a type back on to see them.",
  },
  chat: {
    title: 'Chat',
    chats: 'Chats',
    subhead: 'Ask Atlas anything about a company’s investor calls and filings.',
    askAnything: 'Ask Atlas…',
    history: 'History',
    newChat: 'New chat',
    projects: 'Projects',
    recentChats: 'Recent chats',
    myAgents: 'My Agents',
    mySkills: 'My Skills',
    agentsComingSoon: 'Agents & skills are coming soon',
    watchlists: 'Watchlists',
    companies: 'Companies',
    source: 'Source',
    thinking: 'Thinking…',
    slashHint: 'Type / for commands, @ to mention a company',
    referringTo: 'Referring to',
    snipCap: 'Up to 4 snips per question',
    snipDefault: 'Explain what this snippet shows.',
    snipFailed: 'Snip failed — try again',
    snipTooBig: 'Snip too large — select a smaller area',
    historyFailed: 'Could not load your chats — {error}',
    // Two DIFFERENT failures, deliberately not one string. Before this, both were
    // written into the assistant bubble as if Atlas had said them: the first left
    // the user with a server string where an answer belongs, and the second threw
    // away an answer that had already arrived in full.
    answerFailed: 'Atlas could not answer — {error}',
    // The stream broke partway. What is on screen is real but INCOMPLETE, and
    // saying either "could not answer" or "was not saved" about it would be
    // false in opposite directions.
    answerTruncated: 'This answer was cut off before it finished — {error}',
    // The same fact, read back from storage. No {error}: the cause did not
    // survive the reload and naming one would be an invention.
    answerWasTruncated: 'This answer was cut off before it finished.',
    notSaved: 'This answer arrived but was not saved — {error}',
    pageShort: 'p.',
    suggestions: [
      'Summarize the latest investor call in 3 bullets',
      'List the forward-looking guidance management gave',
      'What changed versus the previous quarter?',
      'What were the key risks mentioned on the call?',
    ],
  },
  company: {
    overview: 'Overview',
    investorCalls: 'Investor Calls',
    latestCall: 'Latest investor call',
    upcomingCalls: 'Upcoming investor calls',
    myQuotes: 'Quotes',
    addInvestorCall: 'Add Investor Call',
    addCallPlaceholder: 'Paste a YouTube link…',
    addCallCta: 'Add',
    openInChat: 'Open in Chat',
    industry: 'Industry',
    backlog: 'All investor calls',
    queued: 'Queued',
    transcribing: 'Transcribing…',
    formatting: 'Formatting…',
    completed: 'Completed',
    failed: 'Failed',
    folders: 'Folders',
    allQuotes: 'All quotes',
    newFolder: 'New folder',
    folderNamePlaceholder: 'Folder name…',
    createFolder: 'Create',
    addToFolder: 'Add to folder',
    removeFromFolder: 'Remove from folder',
    deleteFolder: 'Delete folder',
    emptyFolder: 'No quotes in this folder yet',
    deleteConfirm: 'Delete this transcript? This cannot be undone.',
    renameTitle: 'Title',
    renameQuarter: 'Quarter (e.g. Q4 2025)',
    reports: 'Documents',
    webinars: 'Webinars',
    backToHome: 'Back to Home',
    mostRecentCall: 'Most recent call',
    nextScheduled: 'Next scheduled',
    watchPlayback: 'Watch in playback',
    remindMe: 'Remind me',
    upcoming: 'Upcoming',
    eachQuarter: 'Each quarter:',
    transcript: 'Transcript',
    reportPdf: 'Report PDF',
    slides: 'Slides',
    noReports: 'No calls on record yet.',
    // The documents catalog (2026-08-09): years listed, a year fetched only when opened.
    documentsHint: 'Pick a year to see the reports and presentations filed in it',
    yearLoading: 'Loading filings from TASE…',
    yearEmpty: 'No filings found for this year',
    yearFailed: 'We could not load this year',
    retry: 'Try again',
    annual: 'Annual',
    openingDoc: 'Fetching the document from TASE…',
    openFailed: 'We could not fetch this document',
    noDocsThisPeriod: 'No documents for this period',
    webinarsExplainer:
      'Zoom webinars the company hosted outside its quarterly cycle — dated, not tied to a quarter. Each opens as a live-synced transcript with karaoke playback.',
    noWebinars: 'No webinars on record yet.',
    askAtlas: 'Ask Atlas',
    quartersLabel: 'quarters',
    viewAll: 'View all',
    about: 'About',
    website: 'Website',
    // NOT "Related": the list is the first four companies the feed returns, and
    // relatedness is not computable. Renamed 2026-08-09 when the directory went
    // from 5 companies to 234 and "similar" became a visible claim about four
    // arbitrary issuers.
    // ⚠ THE REASON GIVEN HERE HAS EXPIRED, THE NAME HAS NOT. This said
    // "4 of 234 companies have a sector"; it is now 234 of 234, so relatedness
    // by sector IS computable and this list could become an honest "Similar
    // companies". It is not one yet — the list is still the first four rows the
    // feed returns — so the honest name stays until the query changes.
    relatedCompanies: 'Other companies',
    relatedSub: 'on TASE',
  },
  live: {
    overview: 'Overview',
    backToOverview: 'Back to Overview',
    goToQuote: 'Go to quote',
    transcript: 'Transcript',
    slides: 'Slides',
    report: 'Report',
    liveBadge: 'LIVE',
    preparing: 'Transcript being prepared',
    pauseAudio: 'Pause audio',
    playAudio: 'Play audio',
    autoScroll: 'Auto-scroll',
    refresh: 'Refresh',
    copy: 'Copy',
    searchTranscript: 'Search',
    saveQuote: 'Save quote',
    quoteSaved: 'Saved to My Quotes',
    selectToSave: 'Select text in the transcript to save a quote',
    copied: 'Transcript copied',
    switchCall: 'Switch call',
    editSpeaker: 'Edit speaker name',
    saveSpeaker: 'Save',
    shareTranscript: 'Share as PDF',
    noWordTimings: 'Word-level sync isn’t available for this call yet',
    parts: 'Call sections',
    speakers: 'Speakers',
    liveNowShort: 'Live',
    returnToTranscript: 'Return to transcript',
    returnToLive: 'Return to live',
    askAboutQuote: 'Ask Atlas',
    askAboutQuoteHint: 'Ask anything about the excerpt you highlighted — the audio keeps playing.',
    editSpeakers: 'Edit speakers',
    editSpeakersHint: 'Select text to reassign it to a speaker',
    assignToSpeaker: 'Assign to speaker',
    endedStatus: 'Sourced Investor Call ended, AI is processing your transcript',
    behindLive: 'behind the sourced Investor Call',
    buffering: 'We buffer {min} minutes from the sourced Investor Call to generate a live transcript',
    backToLive: 'Back to live',
    backToPlaying: 'Back to current word',
    openAudioBar: 'Open audio bar',
    stopPlayback: 'Stop the audio',
    // A source that will never load has to SAY so. Without it the bar sits
    // mute, the play button does nothing, and there is no way to tell a broken
    // recording from one that is still fetching.
    playbackFailed: 'This recording could not be loaded',
    slidesEmpty: 'Slides will appear here when linked to this call.',
    reportEmpty: 'The quarterly report will appear here when linked.',
    reportFreely: 'PDF · read freely',
    // The panes state their own condition now — there is no stub behind them.
    docLoading: 'Fetching the document from TASE…',
    docFailed: 'We could not fetch this document',
    noDocument: 'No document for this period',
    demoContent: 'Demo content — not real company data',
    viewLabel: 'View',
    viewSingle: 'Single',
    viewMulti: 'Multi',
    karaokeTag: 'karaoke',
    callSections: 'Call sections',
    askAtlas: 'Ask Atlas',
    snip: 'Snip to chat',
    bufferExplainer:
      'Calls hosted on Atlas run on a ~4–5 minute broadcast delay. The transcript and karaoke sync begin the moment the stream lands.',
    enterLiveNow: 'Enter live now',
    askHeroLine1: 'Ask anything',
    askHeroLine2: 'about this call',
    askHeroCompany: 'about this company',
    askHeroSub: 'The audio keeps playing while you ask.',
    // composer captions (design round 2): what Atlas is connected to, per context
    askFollowLive: "Atlas is following this call live. Ask about anything that's been said.",
    askConnectedCall: "Atlas is connected to this call's context. Ask whatever you'd like.",
    askConnectedCompany: "Atlas is connected to this company's context. Ask whatever you'd like.",
    voiceSoon: 'Voice ask — coming soon',
    slideLabel: 'Slide',
  },
  player: {
    rewind15: 'Back 15s',
    forward15: 'Forward 15s',
    play: 'Play',
    pause: 'Pause',
    speed: 'Speed',
    volume: 'Volume',
    transcriptToggle: 'Transcript',
    captions: 'Captions',
    levels: 'Levels',
    close: 'Close player',
  },
  settings: {
    title: 'Settings',
    language: 'Language',
    languageDesc: 'Choose your interface language and direction.',
    profile: 'Profile',
    account: 'Account',
    notifications: 'Notifications',
    appearance: 'Appearance',
  },
  // Admin · corpus index health (slice A5). The ingestion standard makes an
  // indexing failure visible BY LAW; this is where it becomes visible to a person.
  corpusAdmin: {
    title: 'Corpus index',
    subtitle: 'What the shared corpus is carrying, and what has not finished joining it.',
    adminOnly: 'This page is for administrators.',
    loadFailed: 'Could not read the corpus index status.',
    transcripts: 'Transcripts',
    documents: 'Filings',
    chunks: 'Searchable chunks',
    structuredFacts: 'Structured facts (XBRL)',
    indexed: 'Indexed',
    pending: 'Pending',
    failed: 'Failed',
    excluded: 'Excluded',
    other: 'Unrecognised',
    factsYes: 'Parsed',
    factsNone: 'No structured facts',
    factsFailed: 'Parse failed',
    factsUnknown: 'Not yet examined',
    settled: 'Every source has finished indexing.',
    troubledTitle: 'Not finished indexing',
    troubledEmpty: 'Nothing is waiting or failed.',
    troubledCapped: 'Showing {shown} of {total}. The list is capped; the count above is the real one.',
    excludedNote: 'Excluded rows are deliberate — demo content and known duplicates never enter the corpus.',
  },
  // Projects — the chat sub-panel feature (design lines 1099-1262).
  projects: {
    title: 'Projects',
    subtitle: 'Group related chats, pinned files, and companies into one context.',
    chatsWord: 'chats',
    inContext: 'in context',
    newProject: 'New project',
    untitled: 'Untitled project',
    namePlaceholder: 'Name this project…',
    rename: 'Rename',
    pin: 'Pin project',
    composerPlaceholder: 'Start a chat in {name}…',
    sourcesInContext: '{count} sources in context',
    sourceInContext: '1 source in context',
    send: 'Send',
    recents: 'Recents',
    noChats: 'No chats yet.',
    noChatsHint: "Anything you ask here inherits this project's instructions and context.",
    instructions: 'Instructions',
    editInstructions: 'Edit instructions',
    instructionsPlaceholder: 'e.g. always answer in Hebrew and quote the source line',
    instructionsEmpty: 'No standing instructions yet.',
    memory: 'Memory',
    editMemory: 'Edit memory',
    onlyYou: 'Only you',
    memoryPlaceholder: 'What should Atlas remember about this project?',
    memoryEmpty: 'Nothing remembered yet.',
    memoryJustUpdated: 'Last updated just now',
    memoryNever: 'Never updated',
    memoryUpdated: 'Last updated {when}',
    sourceLine: '1 line',
    sourceLines: '{n} lines',
    sourceEmpty: 'Empty — nothing written yet',
    sourceBodyPlaceholder: 'Write the note Atlas should keep in mind…',
    editSource: 'Edit source',
    overBudget: 'Over capacity — trim this project so Atlas is not sent a truncated context.',
    saveFailed: 'Not saved — {error}',
    loadFailed: 'Could not load your projects — {error}',
    loadOneFailed: 'Could not load this project — {error}',
    openChatFailed: 'Could not open that chat — {error}',
    contextFailed:
      "Answered without this project's context — it could not be loaded, so your instructions, memory and notes did not reach Atlas.",
    contextTruncated:
      "This project's context was too long and was cut to fit, so Atlas did not see all of it.",
    context: 'Context',
    searchContext: 'Search context',
    addContext: 'Add to context',
    capacityUsed: '{pct}% of project capacity used',
    addContextEmpty: 'Add a file, a report, or a company',
    newSource: 'New source {n}',
    newSourceMeta: 'just added',
    notFound: 'This project is no longer here.',
    notFoundHint: 'This project may have been removed, or it belongs to another account.',
    backToProjects: 'Back to Projects',
  },
  // Demo marking. Projects/Workspace/Agents are stub-fed this chapter: the figures,
  // quotes and findings on those surfaces are INVENTED, about real TASE issuers.
  // rules/app.md: degradation must be VISIBLE — never render success UI for content
  // no backend produced.
  demo: {
    bannerTitle: 'Demo content',
    bannerBody:
      'Sample data — not real analysis. The figures, quotes and findings on this page are invented.',
    inlineLabel: 'DEMO',
    inlineHint: 'Invented sample content — not a real source.',
  },
  language: {
    label: 'Language',
    english: 'English',
    hebrew: 'עברית',
  },
  landing: {
    footerRights: 'All rights reserved',
  },
}

export type Dictionary = typeof en
