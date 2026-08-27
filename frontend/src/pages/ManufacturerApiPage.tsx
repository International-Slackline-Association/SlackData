// The /for-manufacturers page — the brand-facing reference for the gear API.
//
// Structured as the round trip, not as an endpoint list: read your gear, read
// what we hold about one of them, edit those keys and send them back. That is
// the call almost every brand makes and the only one most of them ever make,
// so it is steps 1-3 and everything else is reference below the fold. An
// earlier draft opened with OAuth and identity verification, which is the
// order the API was *built* in, not the order it is used in.
//
// Content mirrors MANUFACTURER_API.md, which is the source of truth; the field
// names in § Gear types there are pinned to the API's derived list by
// tests/test_frontend_contract.py. Deliberately NOT rendered from that markdown
// at runtime: same reasoning as SafetyPage.tsx — a markdown renderer is a
// dependency and a bundle cost for one static route.
//
// Not behind a feature flag, unlike /admin. A brand reading this before the API
// is reachable is told to mail us for a credential, which is the entry point
// anyway — so the page is useful when the API is dormant and harmless when it
// is dark. The endpoints it documents are the ones the router actually serves
// (slack_data/api/routers/manufacturer_router.py).

const DOC_URL = 'https://github.com/International-Slackline-Association/SlackData/blob/main/MANUFACTURER_API.md'

// Where a brand asks for a credential. A personal address until the ISA has a
// role address for SlackData — declared once here, and in MANUFACTURER_API.md
// § Getting a credential, so swapping it is one edit in each.
const CONTACT_EMAIL = 'emile.bragard@gmail.com'

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-24">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <div className="mt-3 space-y-4 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  )
}

// Horizontally scrollable on its own, so a long curl line never widens the page.
function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-900 px-4 py-3 text-xs leading-relaxed text-gray-100">
      <code>{children}</code>
    </pre>
  )
}

function Endpoint({ method, path }: { method: string; path: string }) {
  return (
    <p className="font-mono text-sm">
      <span className="mr-2 rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
        {method}
      </span>
      <span className="text-gray-900">{path}</span>
    </p>
  )
}

// Same overflow rule as Code: the status table is wide and must scroll itself.
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {head.map((cell) => (
              <th key={cell} className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-gray-100 align-top">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-2 pr-4 text-gray-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const CODE = 'rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-900'

export default function ManufacturerApiPage() {
  return (
    <div data-cy="manufacturer-api-page" className="mx-auto max-w-3xl">
      <article className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">The gear API, for manufacturers</h1>

        <p className="mt-4 text-sm leading-relaxed text-gray-700">
          How to correct your own products in our catalogue. Three calls: list your gear, read the
          values we hold, send back the ones that are wrong or missing. The second call returns the exact field
          names the third one accepts.
        </p>

        <p className="mt-4 text-sm leading-relaxed text-gray-700">
          Base URL <code className={CODE}>https://slackdata.org/api</code>. Every call sends{' '}
          <code className={CODE}>Authorization: Bearer $TOKEN</code> —{' '}
          <a href="#token" className="font-medium text-amber-700 underline">
            get a token
          </a>
          . No credential yet?{' '}
          <a href="#credential" className="font-medium text-amber-700 underline">
            Ask for one
          </a>
          .
        </p>

        <div
          data-cy="manufacturer-api-callout"
          className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900"
        >
          <strong className="font-semibold">An update is recorded, not applied instantly.</strong>{' '}
          The catalogue is (currently) rebuilt and redeployed from source, so what you send is stored as an
          approved change request, then applied by an administrator and shipped with the next
          release. A <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">201</code>{' '}
          means we have it, not that the site has changed. Records do not expire.
        </div>

        <Section id="list" title="1. List your gear">
          <Endpoint method="GET" path="/manufacturer/gear" />
          <Code>{`curl -s https://slackdata.org/api/manufacturer/gear \\
  -H "Authorization: Bearer $TOKEN"`}</Code>
          <Code>{`[
  { "gear_type": "webbings", "gear_id": 42, "name": "Aero",           "active": true  },
  { "gear_type": "webbings", "gear_id": 57, "name": "Type 18 Mk II",  "active": false },
  { "gear_type": "weblocks", "gear_id": 8,  "name": "Alpine Weblock", "active": true  }
]`}</Code>
          <p>
            Every catalogue row belonging to your brand. <code className={CODE}>gear_id</code> is our
            id — store it against your own SKU. <code className={CODE}>active: false</code> means we
            list the product as discontinued. <code className={CODE}>?gear_type=webbings</code>{' '}
            narrows the list to one type.
          </p>
        </Section>

        <Section id="spec" title="2. Read the values we hold">
          <Endpoint method="GET" path="/manufacturer/gear?include=spec" />
          <Code>{`curl -s 'https://slackdata.org/api/manufacturer/gear?gear_type=webbings&include=spec' \\
  -H "Authorization: Bearer $TOKEN"`}</Code>
          <Code>{`{
  "gear_type": "webbings",
  "gear_id": 42,
  "name": "Aero",
  "rename_to": null,
  "active": true,
  "spec": {
    "brand_name": "Balance Community",
    "width": 25,
    "thickness": 2.5,
    "weight": 59,
    "breaking_strength": 33.4,
    "material": "Polyester",
    "webbing_construction": "Flat",
    "isa_certified": false,
    "price": 2.5,
    "currency": "USD",
    "product_url": "https://www.balancecommunity.com/products/aero-1",
    "active": true
  }
}`}</Code>
          <p>
            The same rows, each widened with a <code className={CODE}>spec</code> object holding the
            values we publish. Its keys are the fields you may change, and are exactly the keys the
            next call accepts. Trimmed above; the response carries every editable field for the type.
          </p>
          <p>
            Field names differ per gear type, so this is the authoritative list for your products. An
            unknown <code className={CODE}>include</code> value is a 422, not a silent ignore.
          </p>
          <p>
            <strong className="font-semibold text-gray-900">The row and the item you post have the
            same shape</strong>, which is what makes the copy mechanical:{' '}
            <code className={CODE}>gear_type</code>, <code className={CODE}>gear_id</code>,{' '}
            <code className={CODE}>name</code> and <code className={CODE}>rename_to</code> at the
            top of both, and <code className={CODE}>spec</code> becomes{' '}
            <code className={CODE}>changes</code>.
          </p>
          <p>
            <code className={CODE}>rename_to</code> is always there and always null — the empty slot
            for a new name, next to the <code className={CODE}>name</code> it would replace. Leave
            it null and nothing happens. Neither of those two keys is inside{' '}
            <code className={CODE}>spec</code>: they are identity, not specification, and{' '}
            <code className={CODE}>name</code> is the handle we match on, so it cannot also be a
            value you change.
          </p>
        </Section>

        <Section id="send" title="3. Send back what is wrong">
          <Endpoint method="POST" path="/manufacturer/gear" />
          <p>
            Identify the product with <code className={CODE}>gear_type</code>,{' '}
            <code className={CODE}>gear_id</code> and <code className={CODE}>name</code> copied from
            the row you read. Put only the keys you changed in{' '}
            <code className={CODE}>changes</code>; anything omitted is left alone.
          </p>
          <Code>{`curl -s -X POST https://slackdata.org/api/manufacturer/gear \\
  -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{
    "note": "spring 2027 line refresh",
    "items": [
      {
        "gear_type": "webbings",
        "gear_id": 42,
        "name": "Aero",
        "changes": { "weight": 61, "breaking_strength": 35.2 },
        "source_url": "https://www.balancecommunity.com/products/aero-1"
      }
    ]
  }'`}</Code>
          <p>
            Up to 50 items per call. <code className={CODE}>note</code> and{' '}
            <code className={CODE}>source_url</code> are optional and are read by the administrator
            who applies the change. An item may also carry your own{' '}
            <code className={CODE}>manufacturer_sku</code>, which is stored with the record.
          </p>
          <Code>{`{
  "batch_id": "01JQ8Z...",
  "brand_id": 17,
  "accepted": 1,
  "results": [
    { "submission_id": "01JQ8Z...", "gear_type": "webbings", "gear_id": 42,
      "gear_name": "Aero", "resolution": "id", "status": "approved", "applied": false }
  ]
}`}</Code>
          <p>
            <code className={CODE}>applied</code> is false until the change ships in a release.
          </p>

          <h3 className="pt-2 text-sm font-bold text-gray-900">Renaming a product</h3>
          <p>
            Fill in the <code className={CODE}>rename_to</code> you were handed in step 2. It is the
            only way to change a name: <code className={CODE}>name</code> at the top of the item
            stays what we call it today, because that is what makes the item resolve.
          </p>
          <Code>{`{ "gear_type": "webbings", "gear_id": 42, "name": "Aero", "rename_to": "Aero 1" }`}</Code>
          <p>
            A rename is a complete item on its own. Two things are dropped rather than refused, so
            that an integration can post the same payload every night without maintaining it: a null{' '}
            <code className={CODE}>rename_to</code>, and one that already matches the name we hold
            because the rename has shipped. Editing <code className={CODE}>name</code> instead is a
            422 pointing you here.
          </p>

          <h3 className="pt-2 text-sm font-bold text-gray-900">Send the name as well as the id</h3>
          <p>
            We check the id belongs to you and that the name still agrees with it. If they disagree
            we match the name within your own products; if that is ambiguous the call is refused
            (409 — send the id to settle it). The response echoes back the id we resolved to: store
            it, because your copy of an id can go stale.
          </p>
          <p>
            An item matching nothing is recorded as a possible new product —{' '}
            <strong className="font-semibold text-gray-900">
              unless you sent a <code className={CODE}>gear_id</code> with it
            </strong>
            , which is refused instead (409). That combination is what a rename looks like from our
            side: both handles are good and they disagree. Filing it as new would queue up a second
            catalogue row for a product we already hold, so the message names what we hold under that
            id. A genuinely new product is unambiguous — send it with no{' '}
            <code className={CODE}>gear_id</code>.
          </p>

          <h3 className="pt-2 text-sm font-bold text-gray-900">All-or-nothing</h3>
          <p>
            If any item fails to resolve, nothing is stored and the whole call is refused, naming the
            item by index — so a retry after the fix cannot duplicate the items that worked. There is
            no idempotency key: do not retry a call that returned 201, or you create a second batch.
          </p>
        </Section>

        <Section id="readback" title="4. Read your submissions back">
          <Endpoint method="GET" path="/manufacturer/submissions" />
          <p>
            Your own submissions, newest first. <code className={CODE}>?batch_id=</code> narrows it to
            one call.
          </p>
          <p>
            Status is <code className={CODE}>approved</code> on arrival. An administrator can reject
            one afterwards, with the reason in <code className={CODE}>review_note</code>. This
            endpoint is the only notice of a rejection — we send no email.
          </p>
        </Section>

        <hr className="mt-12 border-gray-200" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500">Reference</p>

        <Section id="token" title="Access tokens">
          <p>
            OAuth 2.0 client credentials. You were given a <code className={CODE}>client_id</code>, a{' '}
            <code className={CODE}>client_secret</code> and a token URL.
          </p>
          <Code>{`curl -s -X POST "$TOKEN_URL" \\
  -H 'Content-Type: application/x-www-form-urlencoded' \\
  -u "$CLIENT_ID:$CLIENT_SECRET" \\
  -d 'grant_type=client_credentials&scope=slackdata/gear.write'`}</Code>
          <p>
            Send the result as <code className={CODE}>Authorization: Bearer &lt;access_token&gt;</code>{' '}
            and cache it until it expires. The scope is exactly{' '}
            <code className={CODE}>slackdata/gear.write</code>.
          </p>
          <Endpoint method="GET" path="/manufacturer/me" />
          <p>
            Returns the <code className={CODE}>brand_id</code> and{' '}
            <code className={CODE}>brand_name</code> the credential is bound to. Check it once before
            sending data; if it is not you, stop and tell us.
          </p>
        </Section>

        <Section id="codes" title="Status codes">
          <Table
            head={['Code', 'Meaning', 'What to do']}
            rows={[
              ['201', 'The batch was recorded.', 'Store the resolved ids. Do not retry.'],
              ['401', "No token, an expired one, or one we can't verify.", 'Get a new access token.'],
              [
                '403',
                'Your credential is not registered or has been deactivated, or the item names another brand’s gear.',
                <span key="403a">
                  Not retryable. Check the ids came from your own listing call, then{' '}
                  <a href="#credential" className="font-medium text-amber-700 underline">
                    contact us
                  </a>
                  .
                </span>,
              ],
              [
                '409',
                'We cannot tell which product you mean: two of yours answer to that name, or the gear_id and name you sent disagree and the name matches nothing of yours.',
                'Send the gear_id to settle a duplicate name; otherwise the message says what we hold under that id — send that as name, plus rename_to if you renamed it.',
              ],
              ['413', 'Body over 256 KB.', 'Split the batch.'],
              [
                '422',
                'Malformed body, an unknown field name, a name sent inside changes (use rename_to), an empty value, a rename with nothing to rename, or an item that asks for nothing.',
                'The message names the item index and the field. Nothing was stored.',
              ],
              ['429', 'Rate limited (~1 request/second, small burst).', 'Back off.'],
              [
                <strong key="502" className="font-semibold text-gray-900">502</strong>,
                <span key="502m">
                  <strong className="font-semibold text-gray-900">Partial write.</strong> Some items
                  were stored before something failed.
                </span>,
                <span key="502a">
                  <strong className="font-semibold text-gray-900">Do not blind-retry.</strong> The
                  message says how many landed and names the batch_id. Resend only the items after
                  that index, or quote the batch_id to us.
                </span>,
              ],
              [
                '503',
                'Our record of your brand id is stale.',
                <span key="503a">
                  Nothing is wrong with your credential.{' '}
                  <a href="#credential" className="font-medium text-amber-700 underline">
                    Contact us
                  </a>
                  ; an operator re-runs the registration.
                </span>,
              ],
            ]}
          />
        </Section>

        <Section id="fields" title="Gear types and units">
          <p>
            <code className={CODE}>gear_type</code> is one of <code className={CODE}>webbings</code>,{' '}
            <code className={CODE}>weblocks</code>, <code className={CODE}>leashrings</code>,{' '}
            <code className={CODE}>grips</code>, <code className={CODE}>rollers</code>,{' '}
            <code className={CODE}>treepros</code>, <code className={CODE}>starterkits</code>,{' '}
            <code className={CODE}>tricklinekits</code>.
          </p>
          <p>Units are not uniform across gear types:</p>
          <Table
            head={['Field', 'Unit']}
            rows={[
              [
                <span key="p">
                  <code className={CODE}>price</code> on <code className={CODE}>webbings</code>
                </span>,
                <strong key="pv" className="font-semibold text-gray-900">per metre, not per item</strong>,
              ],
              [
                <span key="w">
                  <code className={CODE}>weight</code>
                </span>,
                'grams — grams per metre on webbings',
              ],
              [
                <span key="t">
                  <code className={CODE}>width</code> and <code className={CODE}>length</code> on{' '}
                  <code className={CODE}>treepros</code>
                </span>,
                'centimetres (thickness is millimetres)',
              ],
              [
                <span key="r">
                  <code className={CODE}>width</code> on <code className={CODE}>rollers</code>
                </span>,
                'a string range, e.g. "19-25 mm" — not a number',
              ],
              [
                <span key="c">
                  <code className={CODE}>currency</code>
                </span>,
                'ISO 4217. Quote your own currency; we convert for display. Never pre-convert.',
              ],
            ]}
          />
        </Section>

        <Section id="credential" title="Getting a credential">
          <p>
            Mail{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-amber-700 underline">
              {CONTACT_EMAIL}
            </a>{' '}
            from an address at your brand&apos;s own domain. We confirm out-of-band, against the
            contact details published on your own site, before issuing anything.
          </p>
          <p>
            You will receive a client id, a client secret and the token URL. To revoke, tell us.
          </p>
        </Section>

        <p className="mt-10 border-t border-gray-200 pt-6 text-sm leading-relaxed text-gray-700">
          Full reference, including every field name per gear type:{' '}
          <a
            data-cy="manufacturer-api-doc-link"
            href={DOC_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-amber-700 underline"
          >
            MANUFACTURER_API.md
          </a>
          . If the API does something this page does not describe, tell us.
        </p>
      </article>
    </div>
  )
}
