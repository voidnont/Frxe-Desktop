from pathlib import Path

path = Path('web/app.mjs')
app = path.read_text()

if "  removeTrackReferences,\n" in app:
    app = app.replace("  removeTrackReferences,\n", "  pruneTrackReferences,\n", 1)

old_call = (
    "    const cleaned = removeTrackReferences({\n"
    "      queue: state.queue,\n"
    "      favorites: state.favorites,\n"
    "      history: state.history,\n"
    "      playlists: state.playlists,\n"
    "    }, target);\n\n"
    "    state.queue = cleaned.queue;\n"
)
new_call = (
    "    const cleaned = pruneTrackReferences({\n"
    "      queue: state.queue,\n"
    "      queueIndex: state.queueIndex,\n"
    "      favorites: state.favorites,\n"
    "      history: state.history,\n"
    "      playlists: state.playlists,\n"
    "    }, target);\n\n"
    "    state.queue = cleaned.queue;\n"
    "    state.queueIndex = cleaned.queueIndex;\n"
)
if old_call in app:
    app = app.replace(old_call, new_call, 1)
elif new_call not in app:
    raise SystemExit('Expected download pruning call not found')

marker = "    case 'remove-download': await removeOfflineTrack(track); break;\n    case 'playlist-picker': {\n"
replacement = (
    "    case 'remove-download': await removeOfflineTrack(track); break;\n"
    "    case 'remove-history': {\n"
    "      const target = track || findTrackByKey(button.dataset.track);\n"
    "      if (!target) break;\n"
    "      const key = trackKey(target);\n"
    "      state.history = state.history.filter((item) => trackKey(item) !== key);\n"
    "      persistLists();\n"
    "      render();\n"
    "      break;\n"
    "    }\n"
    "    case 'clear-history':\n"
    "      state.history = [];\n"
    "      persistLists();\n"
    "      render();\n"
    "      break;\n"
    "    case 'playlist-picker': {\n"
)
if marker in app:
    app = app.replace(marker, replacement, 1)
elif "case 'remove-history'" not in app or "case 'clear-history'" not in app:
    raise SystemExit('Expected action insertion point not found')

path.write_text(app)
