export function canSee(message, actor) {
  return message.visibleTo === undefined ||
    (Array.isArray(message.visibleTo) && message.visibleTo.includes(actor));
}

export function isCurrentCard(card, flow) {
  return !card.expired && (!card.phase ||
    (card.phase === flow?.phase && card.step_id === flow?.step_id));
}
