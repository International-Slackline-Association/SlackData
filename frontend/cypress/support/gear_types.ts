export interface GearTypeConfig {
  slug: string
  apiPath: string
  label: string
  hasISA: boolean
  hasISAWarning: boolean
  // spec fields expected on the detail page, keyed by data-field attribute value
  specFields: {
    field: string
    label: string
    unit?: string           // appended to value (e.g. "mm", "kN", "g/m")
    alwaysPresent: boolean  // false = only assert when the API value is non-null
  }[]
}

export const GEAR_TYPES: GearTypeConfig[] = [
  {
    slug: 'webbings',
    apiPath: 'webbing',
    label: 'Webbings',
    hasISA: true,
    hasISAWarning: true,
    specFields: [
      { field: 'material',           label: 'Material',           alwaysPresent: true  },
      { field: 'width',              label: 'Width',              unit: 'mm', alwaysPresent: true  },
      { field: 'weight',             label: 'Weight',             unit: 'g/m', alwaysPresent: false },
      { field: 'breaking_strength',  label: 'Breaking Strength',  unit: 'kN', alwaysPresent: false },
      { field: 'stretch',            label: 'Stretch',            alwaysPresent: false },
      { field: 'classification',     label: 'Classification',     alwaysPresent: false },
      { field: 'colors',             label: 'Colors',             alwaysPresent: false },
    ],
  },
  {
    slug: 'weblocks',
    apiPath: 'weblock',
    label: 'Weblocks',
    hasISA: true,
    hasISAWarning: true,
    specFields: [
      { field: 'material',           label: 'Material',           alwaysPresent: true  },
      { field: 'width_range',        label: 'Width Range',        unit: 'mm', alwaysPresent: true  },
      { field: 'weight',             label: 'Weight',             unit: 'g',  alwaysPresent: false },
      { field: 'breaking_strength',  label: 'Breaking Strength',  unit: 'kN', alwaysPresent: false },
      { field: 'front_pin',          label: 'Front Pin',          alwaysPresent: false },
      { field: 'attachment_point',   label: 'Attachment Point',   alwaysPresent: false },
      { field: 'colors',             label: 'Colors',             alwaysPresent: false },
    ],
  },
  {
    slug: 'leashrings',
    apiPath: 'leashring',
    label: 'Leash Rings',
    hasISA: true,
    hasISAWarning: true,
    specFields: [
      { field: 'material',           label: 'Material',           alwaysPresent: true  },
      { field: 'inner_diameter',     label: 'Inner Diameter',     unit: 'mm', alwaysPresent: false },
      { field: 'outer_diameter',     label: 'Outer Diameter',     unit: 'mm', alwaysPresent: false },
      { field: 'weight',             label: 'Weight',             unit: 'g',  alwaysPresent: false },
      { field: 'breaking_strength',  label: 'Breaking Strength',  unit: 'kN', alwaysPresent: false },
    ],
  },
  {
    slug: 'grips',
    apiPath: 'grip',
    label: 'Grips',
    hasISA: true,
    hasISAWarning: true,
    specFields: [
      { field: 'material',                  label: 'Material',            alwaysPresent: true  },
      { field: 'width_range',               label: 'Width Range',         unit: 'mm', alwaysPresent: true  },
      { field: 'weight',                    label: 'Weight',              unit: 'g',  alwaysPresent: false },
      { field: 'wll',                       label: 'WLL',                 unit: 'kN', alwaysPresent: false },
      { field: 'mbs',                       label: 'MBS',                 unit: 'kN', alwaysPresent: false },
      { field: 'common_slipping_threshold', label: 'Slipping Threshold',  unit: 'kN', alwaysPresent: false },
      { field: 'connection_type',           label: 'Connection Type',     alwaysPresent: false },
    ],
  },
  {
    slug: 'rollers',
    apiPath: 'roller',
    label: 'Rollers',
    hasISA: true,
    hasISAWarning: true,
    specFields: [
      { field: 'material',          label: 'Frame Material',    alwaysPresent: true  },
      { field: 'roller_material',   label: 'Roller Material',   alwaysPresent: true  },
      { field: 'slider_type',       label: 'Slider Type',       alwaysPresent: true  },
      { field: 'lock_type',         label: 'Lock Type',         alwaysPresent: true  },
      { field: 'bearing_material',  label: 'Bearing Material',  alwaysPresent: true  },
      { field: 'width',             label: 'Width Range',       alwaysPresent: false },
      { field: 'weight',            label: 'Weight',            unit: 'g',  alwaysPresent: false },
      { field: 'breaking_strength', label: 'Breaking Strength', unit: 'kN', alwaysPresent: false },
      { field: 'colors',            label: 'Colors',            alwaysPresent: false },
    ],
  },
  {
    slug: 'treepros',
    apiPath: 'treepro',
    label: 'Tree Protectors',
    hasISA: false,
    hasISAWarning: false,
    specFields: [
      { field: 'weight',               label: 'Weight',     unit: 'g',  alwaysPresent: false },
      { field: 'width',                label: 'Width',      unit: 'cm', alwaysPresent: false },
      { field: 'length',               label: 'Length',     unit: 'cm', alwaysPresent: false },
      { field: 'thickness',            label: 'Thickness',  unit: 'mm', alwaysPresent: false },
      { field: 'has_sling_attachment', label: 'Sling Attachment', alwaysPresent: false },
    ],
  },
  {
    slug: 'starterkits',
    apiPath: 'starterkit',
    label: 'Starter Kits',
    hasISA: true,
    hasISAWarning: false,
    specFields: [
      { field: 'webbing_length', label: 'Webbing Length', unit: 'm',  alwaysPresent: true  },
      { field: 'webbing_width',  label: 'Webbing Width',  unit: 'mm', alwaysPresent: true  },
      { field: 'weight',         label: 'Weight',         unit: 'g',  alwaysPresent: false },
      { field: 'tensioning_type',label: 'Tensioning',     alwaysPresent: true  },
      { field: 'includes_treepro', label: 'Includes Tree Pro', alwaysPresent: false },
    ],
  },
  {
    slug: 'tricklinekits',
    apiPath: 'tricklinekit',
    label: 'Trickline Kits',
    hasISA: true,
    hasISAWarning: false,
    specFields: [
      { field: 'webbing_length', label: 'Webbing Length', unit: 'm',  alwaysPresent: true  },
      { field: 'webbing_width',  label: 'Webbing Width',  unit: 'mm', alwaysPresent: true  },
      { field: 'weight',         label: 'Weight',         unit: 'g',  alwaysPresent: false },
      { field: 'tensioning_type',label: 'Tensioning',     alwaysPresent: true  },
      { field: 'includes_treepro', label: 'Includes Tree Pro', alwaysPresent: false },
    ],
  },
]
