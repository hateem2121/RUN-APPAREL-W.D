import type { ProductCard } from '../../lib/content'
import type { Family } from '../../lib/families'
import { type Sport, sportCounts, sportPlaces, sportsFor } from '../../lib/sports'
import { ProductCardItem } from './ProductCardItem'

/**
 * A family's garments on its buyer page; on the Teamwear page, a button for each sport above them
 * (polish S7; the six groups are the owner's, Q44, 2026-10-04).
 *
 * ⚠️ NO SCRIPT. The buttons are radios, and site.css shows the chosen sport's cards (`.sport-scope`,
 * "One sport at a time"), so the page filters with scripting off, draws nothing late and moves
 * nothing as it loads. Every garment is in the HTML whichever sport is chosen (D1). "All" is chosen
 * first, and the choice is kept in no address (the owner's answer Q27).
 *
 * Buttons only where they divide the list: two sports or more with garments on the page. A garment
 * of no sport (its type names none) is under "All" only.
 */
export function GarmentGrid({
  family,
  garments,
}: {
  family: Family
  garments: readonly ProductCard[]
}) {
  const sports = sportsFor(family)
  const places = sportPlaces(garments, sports)
  const counts = sportCounts(places, sports)
  const divided = counts.length >= 2
  const grid = (
    <ul className="product-grid">
      {garments.map((product, index) => (
        // `index + 1`: these cards start below the first screen, so none loads eagerly.
        <ProductCardItem
          key={product.slug}
          product={product}
          index={index + 1}
          heading="h3"
          place={divided ? places[index] : undefined}
        />
      ))}
    </ul>
  )
  if (!divided) return grid
  return (
    <div className="sport-scope">
      <SportFilter counts={counts} total={garments.length} />
      {grid}
    </div>
  )
}

/** The sport buttons: one radio group, "All" first, then the owner's order (`TEAMWEAR_SPORTS`). */
function SportFilter({
  counts,
  total,
}: {
  counts: ReadonlyArray<{ sport: Sport; count: number }>
  total: number
}) {
  const chip = (value: string, label: string, count: number) => (
    <label key={value} className="filter-chip sport-filter__chip">
      <input
        className="sport-filter__input visually-hidden"
        type="radio"
        name="sport"
        value={value}
        defaultChecked={value === 'all'}
      />
      {/* The space makes the radio's name "Soccer 4", not "Soccer4"; the chip's gap draws it. */}
      {label} <span className="filter-chip__count">{count}</span>
    </label>
  )
  return (
    <fieldset className="sport-filter">
      <legend className="visually-hidden">Sport</legend>
      <div className="filter-bar filter-bar--scroll">
        {chip('all', 'All', total)}
        {counts.map(({ sport, count }) => chip(sport.key, sport.label, count))}
      </div>
    </fieldset>
  )
}
