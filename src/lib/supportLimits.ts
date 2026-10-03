/**
 * The support-attachment size ceiling, in one place.
 *
 * It previously existed as two independent literals — one in the browser
 * component, one in the presign route's ROOT_MAX_SIZE_BYTES — plus the number
 * "20MB" typed by hand into three separate pieces of user-facing copy. Raising
 * the limit therefore meant finding five things, and missing one of the copy
 * strings would have left the form promising a limit the server rejects.
 *
 * 100MB because a support attachment is frequently a screen recording, which
 * is exactly the case the old 20MB ceiling failed: the bug reports that need a
 * video most are the ones that take longest to reproduce on camera. Support
 * tickets and their attachments are deleted after resolution, so this is not
 * accumulating storage the way progress photos do.
 *
 * Still well under the presign route's global 200MB ceiling.
 */
export const SUPPORT_MAX_BYTES = 100 * 1024 * 1024;

/** "100MB" — for user-facing copy, derived so it can never disagree. */
export const SUPPORT_MAX_LABEL = `${SUPPORT_MAX_BYTES / 1024 / 1024}MB`;
