// Màn team: tổng kết khi hết trận (tải toàn bộ diễn biến, lộ màu thật trên bản đồ).

import { api } from '/shared/api.js'
import { sound } from '/shared/sound.js'
import { finalOwnership, resultsView } from '/shared/results.js'
import { cultureView } from '/shared/culture.js'
import { labeled } from '/shared/icons.js'
import { $, button, el } from '/shared/dom.js'
import { closeDialog, dlg, openDialog } from './dialogs.js'
import { toast } from './notify.js'
import { renderAll } from './render.js'
import { nameOf, state } from './state.js'

// ---------- Tổng kết ----------
export async function loadFinal() {
  if (state.loadingFinal) return
  state.loadingFinal = true
  try {
    const data = await api('/api/replay')
    state.final = { data, owners: finalOwnership(data), teams: new Map(data.teams.map(t => [t.id, t])) }
  } catch (err) {
    toast(err.message, true)
    return
  } finally {
    state.loadingFinal = false
  }
  renderAll()
  state.map.zoomReset()
  if (state.final.data.scores[0]?.teamId === state.me.team.id) { sound.capture(); setTimeout(() => sound.event(), 400) } else sound.event()
  openResults()
}

function openResults() {
  if (!state.final) return
  state.question = null
  openDialog('results', resultsView(state.final.data, { myTeamId: state.me.team.id }), cultureView(state.final.data.culture, nameOf),
    el('div', { class: 'dialog-actions' }, button(labeled('map', 'Xem bản đồ'), 'green', closeDialog)))
  dlg.classList.add('results-dlg')
}
$('resultsBtn').addEventListener('click', openResults)
