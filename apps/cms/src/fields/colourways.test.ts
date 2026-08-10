import { describe, expect, it } from 'vitest'
import { colourwaysField } from './colourways'

const fieldNamed = (name: string) =>
  colourwaysField.fields.find((f) => 'name' in f && f.name === name) as {
    hooks?: { beforeValidate?: ((args: never) => unknown)[] }
  }

const run = (name: string, args: unknown) =>
  fieldNamed(name).hooks?.beforeValidate?.[0]?.(args as never)

describe('colour row auto-fill', () => {
  it('suggests a slug into a blank field', () => {
    expect(run('slug', { siblingData: { displayName: 'Powder Blue' }, value: '' })).toBe(
      'powder-blue',
    )
  })
  it('NEVER rewrites an existing slug — it is on a printed QR tag', () => {
    expect(run('slug', { siblingData: { displayName: 'Powder Blue' }, value: 'navy' })).toBe('navy')
  })
  it('writes a photo description from the product and colour name', () => {
    expect(
      run('altText', {
        data: { productName: 'Velocity Tee' },
        siblingData: { displayName: 'Wine' },
        value: '',
      }),
    ).toBe('Velocity Tee in Wine')
  })
  it('leaves a written description alone', () => {
    expect(
      run('altText', {
        data: { productName: 'Velocity Tee' },
        siblingData: { displayName: 'Wine' },
        value: 'Front three-quarter view',
      }),
    ).toBe('Front three-quarter view')
  })
  it('leaves the description blank when it has nothing to build one from', () => {
    expect(run('altText', { data: {}, siblingData: {}, value: '' })).toBe('')
  })
})
