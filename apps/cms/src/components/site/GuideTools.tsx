'use client'

import { type ReactNode, useEffect, useState } from 'react'
import type { GuideTool } from '../../lib/guides'
import {
  BALL_SIZES,
  BALL_WORDS,
  type BallCountry,
  ballSize,
  CBM_WORDS,
  type CartonUnit,
  cartonVolume,
  convertWeight,
  GSM_WORDS,
  type GsmUnit,
  MEASURES,
  type Measure,
} from '../../lib/guideTools'

/**
 * The guides' three small tools (C6, owner approved every word on 6 Nov 2026), each a block in the
 * section that owns its topic, with an anchor (`#gsm-converter`, `#cbm-calculator`,
 * `#ball-size-lookup`). The sums and the words are `lib/guideTools.ts`, tested row by row.
 *
 * ⚠️ NATIVE CONTROLS, NOTHING CUSTOM (W3C WAI and GOV.UK, the draft's build references): the units
 * and countries are radios in a fieldset, drawn as the contact form's chips; the age group is a
 * native `select`; each result is an `<output>` (role `status`, so a screen reader hears it), and its
 * words wait about half a second after the last key so a number is not read out digit by digit.
 *
 * ⚠️ NOTHING IS SENT OR KEPT: no request, cookie or storage, and `ph-no-capture` keeps the block out of
 * session recordings (the draft's privacy rule; the site already masks every typed box).
 */

/** The text, half a second after it last changed (the draft: "announcements wait about 500 ms"). */
function useSettled<T>(value: T, ms = 500): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return settled
}

function Choices<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string
  legend: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="guide-tool__choices">
      <legend className="inquiry-form__label">{legend}</legend>
      <div className="inquiry-form__answers">
        {options.map((option) => (
          <label className="filter-chip inquiry-form__answer" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ToolFrame({
  id,
  heading,
  lead,
  children,
  notes,
}: {
  id: GuideTool
  heading: string
  lead: string
  children: ReactNode
  notes: readonly string[]
}) {
  return (
    <section
      id={id}
      className="guide-tool inquiry-form ph-no-capture"
      aria-labelledby={`${id}-title`}
    >
      <h3 id={`${id}-title`} className="product-card__name prose__heading">
        {heading}
      </h3>
      <p>{lead}</p>
      {children}
      {notes.map((note) => (
        <p className="guide-tool__note" key={note}>
          {note}
        </p>
      ))}
    </section>
  )
}

function GsmConverter() {
  const [unit, setUnit] = useState<GsmUnit>('gsm')
  const [typed, setTyped] = useState('')
  const answer = convertWeight(typed, unit)
  const shown = useSettled(answer?.result ?? '')
  const words = GSM_WORDS.units[unit]
  return (
    <ToolFrame
      id="gsm-converter"
      heading={GSM_WORDS.heading}
      lead={GSM_WORDS.lead}
      notes={[GSM_WORDS.rounding, GSM_WORDS.credit]}
    >
      <Choices
        name="gsm-unit"
        legend={GSM_WORDS.legend}
        value={unit}
        onChange={setUnit}
        options={[
          { value: 'gsm', label: GSM_WORDS.units.gsm.choice },
          { value: 'oz', label: GSM_WORDS.units.oz.choice },
        ]}
      />
      <div className="inquiry-form__field">
        <label className="inquiry-form__label" htmlFor="gsm-input">
          {words.label}
        </label>
        <p className="guide-tool__hint" id="gsm-hint">
          {words.hint}
        </p>
        <input
          className="inquiry-form__input"
          id="gsm-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-describedby={answer?.error ? 'gsm-hint gsm-error' : 'gsm-hint'}
          aria-invalid={answer?.error ? true : undefined}
        />
        <p className="inquiry-form__error" id="gsm-error" hidden={!answer?.error}>
          {answer?.error}
        </p>
      </div>
      <output className="guide-tool__result" htmlFor="gsm-input">
        {shown}
      </output>
    </ToolFrame>
  )
}

function CbmCalculator() {
  const [unit, setUnit] = useState<CartonUnit>('cm')
  const [sizes, setSizes] = useState<Record<Measure, string>>({ length: '', width: '', height: '' })
  const [count, setCount] = useState('')
  const answer = cartonVolume(sizes, count, unit)
  const shown = useSettled(answer.lines.join(' '))
  const wrongMeasure = (measure: Measure) => Boolean(answer.wrong?.includes(measure))
  return (
    <ToolFrame
      id="cbm-calculator"
      heading={CBM_WORDS.heading}
      lead={CBM_WORDS.lead}
      notes={[CBM_WORDS.rounding, CBM_WORDS.closing, CBM_WORDS.credit]}
    >
      <Choices
        name="cbm-unit"
        legend={CBM_WORDS.legend}
        value={unit}
        onChange={setUnit}
        options={[
          { value: 'cm', label: CBM_WORDS.units.cm },
          { value: 'in', label: CBM_WORDS.units.in },
        ]}
      />
      <div className="guide-tool__measures">
        {MEASURES.map((measure) => (
          <div className="inquiry-form__field" key={measure}>
            <label className="inquiry-form__label" htmlFor={`cbm-${measure}`}>
              {CBM_WORDS.measureLabel(measure, unit)}
            </label>
            <input
              className="inquiry-form__input"
              id={`cbm-${measure}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={sizes[measure]}
              onChange={(event) => setSizes({ ...sizes, [measure]: event.target.value })}
              aria-describedby={wrongMeasure(measure) ? 'cbm-measure-error' : undefined}
              aria-invalid={wrongMeasure(measure) ? true : undefined}
            />
          </div>
        ))}
      </div>
      {/* ONE message for every measurement in error, so three wrong boxes never say it three times. */}
      <p className="inquiry-form__error" id="cbm-measure-error" hidden={!answer.measureError}>
        {answer.measureError}
      </p>
      <div className="inquiry-form__field">
        <label className="inquiry-form__label" htmlFor="cbm-count">
          {CBM_WORDS.countLabel}
        </label>
        <p className="guide-tool__hint" id="cbm-count-hint">
          {CBM_WORDS.countHint}
        </p>
        <input
          className="inquiry-form__input"
          id="cbm-count"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={count}
          onChange={(event) => setCount(event.target.value)}
          aria-describedby={answer.countError ? 'cbm-count-hint cbm-count-error' : 'cbm-count-hint'}
          aria-invalid={answer.countError ? true : undefined}
        />
        <p className="inquiry-form__error" id="cbm-count-error" hidden={!answer.countError}>
          {answer.countError}
        </p>
      </div>
      <output className="guide-tool__result" htmlFor="cbm-length cbm-width cbm-height cbm-count">
        {shown}
      </output>
    </ToolFrame>
  )
}

function BallSizeLookup() {
  const [country, setCountry] = useState<BallCountry>('england')
  const [group, setGroup] = useState('')
  const shown = ballSize(country, group) ?? ''
  return (
    <ToolFrame
      id="ball-size-lookup"
      heading={BALL_WORDS.heading}
      lead={BALL_WORDS.lead}
      notes={[BALL_WORDS.range, BALL_WORDS.credit]}
    >
      <Choices
        name="ball-country"
        legend={BALL_WORDS.legend}
        value={country}
        onChange={(next) => {
          // A change of content, not of context: the list is rebuilt and the answer cleared.
          setCountry(next)
          setGroup('')
        }}
        options={[
          { value: 'england', label: BALL_WORDS.countries.england },
          { value: 'us', label: BALL_WORDS.countries.us },
        ]}
      />
      <div className="inquiry-form__field">
        <label className="inquiry-form__label" htmlFor="ball-group">
          {BALL_WORDS.listLabel[country]}
        </label>
        <select
          className="inquiry-form__input guide-tool__select"
          id="ball-group"
          value={group}
          onChange={(event) => setGroup(event.target.value)}
        >
          <option value="">{BALL_WORDS.firstLine}</option>
          {BALL_SIZES[country].map((row) => (
            <option key={row.group} value={row.group}>
              {row.group}
            </option>
          ))}
        </select>
      </div>
      <output className="guide-tool__result" htmlFor="ball-group">
        {shown}
      </output>
    </ToolFrame>
  )
}

export function GuideToolBlock({ tool }: { tool: GuideTool }) {
  if (tool === 'gsm-converter') return <GsmConverter />
  if (tool === 'cbm-calculator') return <CbmCalculator />
  return <BallSizeLookup />
}
