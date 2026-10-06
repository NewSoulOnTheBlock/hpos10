# PR #2: $BITCOIN frontend text examples

The frontend mixed the legacy HPOS10I ticker with the correct $BITCOIN branding. This change consistently displays $BITCOIN in quote-token labels, fallback states, route descriptions, fees, earnings, tooltips, errors and frontend documentation.

The paired mint / CA remains <code>CTgiaZUK12kCcB8sosn4Nt2NZtzLgtPqDwyQyr2syATC</code> with 8 decimals. API data and backend configuration keep their existing values. Mint and pool addresses, amounts, fee math, transaction building/signing, Copy CA and explorer targets remain unchanged. SOL and unrelated launched-token tickers are preserved. Historical NFT collection names, social handles and image filenames are unchanged.

Captured October 6, 2026. The implementation updates 22 application files; this directory contains review screenshots.

App screenshots use the running PR branch with live production data through a read-only preview. Images headed “PR #2 · COMPONENT EXAMPLE · SAMPLE DATA” are isolated renders of the actual branch components or formatting functions for conditional displays. They do not change production settings. No wallet signing or transactions occurred. Figures show text examples; live numerical values can change over time.

## Updated surfaces

| Place | Updated wording |
|---|---|
| Home / creep map | Token payout tooltips, wallet resource tooltip, selected-token volume and market-cap currency labels. |
| Top resource bar | Quote-token wallet tooltip and screen-reader label. |
| Swarm board | Pairing headline, cards, featured-card currencies, creator/reflection totals and live trade feed. |
| Token overview | Creator earnings, total fees, reflected totals and quote-based price / market-cap labels. |
| Trade console | Pay/Get buttons, amount and quick-amount accessibility labels, proceeds, fees, readable routes and fee summary. |
| Market-cap chart | Currency labels when displaying quote-token values instead of USD. |
| Bonding curve / evolution | Amount raised, graduation target and graduation explanation. |
| Token About section | Fee currency, payout totals and creator/holder payout explanations. |
| Trade history | Quote-token column heading. |
| Rewards / reflections | Earned totals, reflected totals and automatic holder-payout wording. |
| Wallet pages | Earnings totals, per-token earnings, payout/trade history and empty-state explanations. |
| Pending rewards panel | Pending amount and small-payout threshold wording. |
| Token creation | First-buy payment button, amount label, creator-earnings explanation and fee summary. |
| Fee disclosures | Shared fee labels and the manual’s fee-breakdown widget. |
| Manual | Launchpad introduction and SOL / quote-token payment explanations. |
| API documentation | Token description, amount units, swap-route example, fees, graduation threshold and payout explanations. |
| Error messages | Insufficient-funds wording. |
| Loading / API-error states | Shared symbol and route-display helper; loading and unavailable-config fallback. |

## Captioned examples

<details>
<summary><strong>01. Home / creep map</strong></summary>

$BITCOIN paid out by this token; $BITCOIN in your wallet; 24h volume in $BITCOIN.

![Home / creep map — updated text example](creep-map.jpg)

</details>

<details>
<summary><strong>02. Top resource bar</strong></summary>

Tooltip: “$BITCOIN in your wallet”. Screen-reader currency label: “$BITCOIN”. The bar uses icons visually.

![Top resource bar — updated text example](resource-bar.jpg)

</details>

<details>
<summary><strong>03. Swarm board</strong></summary>

“Every token trades against $BITCOIN”; card earnings and live bought/sold amounts use $BITCOIN. Launched-token tickers remain their own names.

![Swarm board — updated text example](board.jpg)

</details>

<details>
<summary><strong>04. Token overview</strong></summary>

Creator earned: … $BITCOIN; of … $BITCOIN fees; quote-based Price and Market cap use $BITCOIN. The second image is a labeled sample with USD unavailable.

![Token overview — updated text example](token-overview.jpg)

![Token overview — updated text example](token-overview-sample.jpg)

</details>

<details>
<summary><strong>05. Trade console</strong></summary>

“Pay $BITCOIN”, “Get $BITCOIN”, “Amount in $BITCOIN”, “Trade fee … $BITCOIN”, and “fee in $BITCOIN”. Readable SOL / DBC routes map the legacy ticker to $BITCOIN; API request values remain SOL / QUOTE.

![Trade console — updated text example](trade-buy.jpg)

![Trade console — updated text example](trade-sell.jpg)

</details>

<details>
<summary><strong>06. Market-cap chart</strong></summary>

“50.00k $BITCOIN” in the labeled chart-value sample. This illustrates the quote-unit label when USD is unavailable.

![Market-cap chart — updated text example](quote-chart.jpg)

</details>

<details>
<summary><strong>07. Bonding curve / evolution</strong></summary>

“12.5K / 429.97K $BITCOIN”; “Hatches into a DAMM v2 pool once 429.97K $BITCOIN is raised.” Labeled sample data.

![Bonding curve / evolution — updated text example](curve-target.jpg)

</details>

<details>
<summary><strong>08. Token About section</strong></summary>

“Trade fee · paid in $BITCOIN”; Fees generated and Paid to creator totals in $BITCOIN; “Every trade pays 1.60% in $BITCOIN”.

![Token About section — updated text example](token-about.jpg)

</details>

<details>
<summary><strong>09. Trade history</strong></summary>

The quote-amount column is headed “$BITCOIN”; the BOCCA column still identifies the launched token.

![Trade history — updated text example](trade-history.jpg)

</details>

<details>
<summary><strong>10. Rewards / reflections</strong></summary>

Your Rewards amounts and holder-payout explanation use $BITCOIN; the ledger says “… $BITCOIN reflected to holders so far”. Labeled samples show reflections enabled.

![Rewards / reflections — updated text example](holder-rewards.jpg)

![Rewards / reflections — updated text example](reflection-ledger.jpg)

</details>

<details>
<summary><strong>11. Wallet pages</strong></summary>

“Total earned as creator” and each token’s creator share use $BITCOIN; the wallet trade log’s quote column is $BITCOIN.

![Wallet pages — updated text example](wallet.jpg)

</details>

<details>
<summary><strong>12. Pending rewards panel</strong></summary>

“0.5 $BITCOIN”; “Dust waits until it reaches 1 $BITCOIN.” Labeled pending-reward sample.

![Pending rewards panel — updated text example](pending-rewards.jpg)

</details>

<details>
<summary><strong>13. Token creation</strong></summary>

“Pay $BITCOIN”; “Amount ($BITCOIN)”; “You earn 0.75% of every trade … in $BITCOIN”; “Trade fee 1.6% in $BITCOIN”.

![Token creation — updated text example](create-token.jpg)

![Token creation — updated text example](create-earnings.jpg)

</details>

<details>
<summary><strong>14. Fee disclosures</strong></summary>

“Trade fee 1.6% in $BITCOIN”; “1.60% fee in $BITCOIN”. Component preview uses the live configuration’s unchanged fee values.

![Fee disclosures — updated text example](fee-disclosures.jpg)

</details>

<details>
<summary><strong>15. Manual</strong></summary>

“Quoted in $BITCOIN on Solana”; “Curves are priced in the quote token, $BITCOIN”; SOL-to-$BITCOIN payment explanation.

![Manual — updated text example](manual.jpg)

</details>

<details>
<summary><strong>16. API documentation</strong></summary>

Overview identifies $BITCOIN on Solana. Spawn flow includes “SOL > $BITCOIN (Jupiter) > Meteora DBC”. Trading documents QUOTE ($BITCOIN) and feeQuote ($BITCOIN). Fees / lifecycle documents the quote, graduation target, creator payouts and holder payouts in $BITCOIN. Endpoint names and parameter keys are unchanged.

![API documentation — updated text example](api-overview.jpg)

![API documentation — updated text example](api-spawn.jpg)

![API documentation — updated text example](api-trading.jpg)

![API documentation — updated text example](api-fees-payouts.jpg)

</details>

<details>
<summary><strong>17. Error messages</strong></summary>

Actual error-formatter output: “You require more minerals. (Not enough SOL or $BITCOIN to cover this and network fees.)” Labeled message preview; no failed transaction was submitted.

![Error messages — updated text example](insufficient-funds.jpg)

</details>

<details>
<summary><strong>18. Loading / API-error states</strong></summary>

Missing config, HPOS10I, $HPOS10I, BITCOIN and $BITCOIN display as $BITCOIN. SOL remains SOL. The route example displays “SOL > $BITCOIN (Jupiter) > Meteora DBC”. Labeled component / formatter samples.

![Loading / API-error states — updated text example](config-fallback.jpg)

![Loading / API-error states — updated text example](display-mapping.jpg)

</details>
