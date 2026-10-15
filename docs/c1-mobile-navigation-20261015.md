# Reproduced mobile navigation overflow

The owner's final stabilization instruction requires readable desktop and mobile layouts, permits repairs of verified defects, and prohibits another UI redesign. The subsequent post-close acceptance authorized the smallest repair of this reproduced defect.

Production `5c207a9` served a four-button navigation row with `flex-wrap:nowrap` and `overflow-x:visible`. At a 390px viewport, its 370px container had 407px of content and the Single button ended at x417.14, widening the whole page to 417px. The same failure occurred at 360px. This was not a deliberately scrollable navigation container. Exact published JavaScript reproduced the defect after offline hydration and tab selection; all backend requests were blocked and no account was accessed.

The only application change is `nav{flex-wrap:wrap}` inside the existing `max-width:700px` media rule in `pages/index.js`. Button names, order, active state, actions, styling and desktop layout remain unchanged. No trading logic, account records, provider behavior or other UI components change.

The existing compact UI regression now renders the actual navigation for every tab and checks that wrapping applies only within the existing mobile breakpoint. Chromium checks of actual CSS at 360/375/390px show all buttons inside the navigation and page width equal to viewport width; 1440px desktop bounds are unchanged. Only the `pages/index.js` freeze hash and its authorization note are updated; the guard and build hooks are untouched.
