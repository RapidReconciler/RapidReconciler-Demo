/* Fire the reload-cardex preview for the date the end-of-day check suggests.
 *
 * The page prefills and previews automatically ONLY when the server-side snooze
 * ack is absent (cardexSnoozeUntil reads /admin/acks). On a snoozed database the
 * auto-path never runs at capture time, while an older acks body in the
 * recording lets it run at replay -- so the replay asks for a preview nothing
 * recorded. Setting the date and dispatching `change` is the admin's own path to
 * the same request: $('js-from').addEventListener('change', loadPreview).
 */
window.__rrFirePreview = function (isoDate) {
  var i = document.getElementById('js-from');
  if (!i) return 'no js-from input';
  if (!isoDate) return 'no date given';
  i.value = isoDate;
  i.dispatchEvent(new Event('change', { bubbles: true }));
  return 'change dispatched for ' + isoDate;
};
'ready';
