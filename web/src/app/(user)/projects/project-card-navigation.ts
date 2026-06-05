const PROJECT_CARD_INTERACTIVE_SELECTOR = 'a,button,input,textarea,select,[contenteditable="true"],[data-project-card-action]';

type ClosestTarget = {
    closest: (selector: string) => unknown;
};

export function isProjectCardInteractiveTarget(target: ClosestTarget | null | undefined) {
    return Boolean(target?.closest(PROJECT_CARD_INTERACTIVE_SELECTOR));
}

export function shouldOpenProjectCardFromTarget(target: EventTarget | null) {
    if (typeof Element === "undefined" || !(target instanceof Element)) return true;
    return !isProjectCardInteractiveTarget(target);
}
