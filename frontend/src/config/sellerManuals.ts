// Sellers whose range-wide manual also covers what they resell.
//
// A range-wide manual (a brand's `manuals` for one gear type) normally reaches the maker's
// own products only. Aki Slacklines is the exception: Aki carried on part of
// the Landcruising range, and its webbing manual's spec table lists those
// webbings (Wave 19/25/32, White Magic, Wizard) beside Aki's own. So on a
// webbing Aki sells, Aki's manual applies whoever made it.
//
// Opt-in per brand rather than true of every seller: Spider Slacklines and
// Slack Inov co-list each other's whole range and each file the same webbing
// manual, so a general rule would show that one PDF twice on every page of
// theirs. See DESIGN.md § Range-wide manuals.
export const SELLER_RANGE_MANUALS: readonly string[] = ['Aki Slacklines']
