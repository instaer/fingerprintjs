import { withIframe } from '../utils/dom'

// We use m or w because these two characters take up the maximum width.
// And we use a LLi so that the same matching fonts can get separated.
const testString = 'mmMwWLliI0O&1'

// We test using 48px font size, we may use any size. I guess larger the better.
const textSize = '48px'

// A font will be compared against all the three default fonts.
// And if for any default fonts it doesn't match, then that font is available.
const baseFonts = ['monospace', 'sans-serif', 'serif'] as const

// The fonts that are installed with Microsoft Office or Adobe products on multiple platforms.
// They give entropy on any desktop platform, so they are tested everywhere.
const commonFontList = [
  'Arial Unicode MS',
  'Century Gothic',
  'Franklin Gothic',
  'Calibri',
  'MYRIAD PRO',
  'TRAJAN PRO',
  'Minion Pro',
  'Monotype Corsiva',
] as const

// The fonts that come with Windows. Testing them on other platforms is a pure cost: they are almost always
// missing there, so they give no entropy but force a synchronous layout.
const windowsFontList = [
  'Agency FB',
  'Arabic Typesetting',
  'AvantGarde Bk BT',
  'BankGothic Md BT',
  'Batang',
  'Century',
  'Clarendon',
  'EUROSTILE',
  'Futura Bk BT',
  'Futura Md BT',
  'GOTHAM',
  'HELV',
  'Haettenschweiler',
  'Humanst521 BT',
  'Leelawadee',
  'Letter Gothic',
  'Levenim MT',
  'Lucida Bright',
  'Lucida Sans',
  'MS Mincho',
  'MS Reference Specialty',
  'MS UI Gothic',
  'Marlett',
  'Meiryo UI',
  'Microsoft Uighur',
  'PMingLiU',
  'Pristina',
  'SCRIPTINA',
  'Segoe UI Light',
  'Serifa',
  'SimHei',
  'Small Fonts',
  'Staccato222 BT',
  'Univers CE 55 Medium',
  'Vrinda',
  'ZWAdobeF',
] as const

// The fonts that come with macOS and iOS
const macOsFontList = ['Gill Sans', 'Helvetica Neue', 'Menlo'] as const

// The fonts that usually come with Linux desktop distributions
const linuxFontList = [
  'Bitstream Vera Sans Mono',
  'DejaVu Sans',
  'DejaVu Sans Mono',
  'DejaVu Serif',
  'Liberation Sans',
  'Liberation Serif',
  'Liberation Mono',
  'FreeSans',
  'FreeMono',
  'Ubuntu',
  'Cantarell',
  'Noto Sans',
  'Noto Serif',
] as const

// The fonts that are specific to Android. The font variety on Android is tiny, so the list is short.
const androidFontList = ['sans-serif-thin', 'Droid Sans', 'Droid Serif', 'Droid Sans Mono'] as const

/**
 * Selects the font list for the current platform. Each font is tested as 3 spans (one per base font),
 * and every span read forces a synchronous layout, so testing fonts of other platforms would be a pure cost:
 * they are almost always missing there, so they give no entropy.
 */
function getPlatformFontList(): readonly string[] {
  const userAgent = navigator.userAgent
  if (/Android/i.test(userAgent)) {
    return androidFontList
  }
  if (/(iPhone|iPad|iPod)/i.test(userAgent)) {
    return macOsFontList
  }
  if (/Windows/i.test(userAgent)) {
    return [...commonFontList, ...windowsFontList]
  }
  if (/(Macintosh|Mac OS X)/i.test(userAgent)) {
    return [...commonFontList, ...macOsFontList]
  }
  // Linux desktop and unknown platforms
  return [...commonFontList, ...linuxFontList]
}

// kudos to http://www.lalit.org/lab/javascript-css-font-detect/
export default function getFonts(): Promise<string[]> {
  // Running the script in an iframe makes it not affect the page look and not be affected by the page CSS. See:
  // https://github.com/fingerprintjs/fingerprintjs/issues/592
  // https://github.com/fingerprintjs/fingerprintjs/issues/628
  return withIframe(async (_, { document }) => {
    const fontList = getPlatformFontList()

    const holder = document.body
    holder.style.fontSize = textSize

    // div to load spans for the default fonts and the fonts to detect
    const spansContainer = document.createElement('div')
    spansContainer.style.setProperty('visibility', 'hidden', 'important')

    const defaultWidth: Partial<Record<string, number>> = {}
    const defaultHeight: Partial<Record<string, number>> = {}

    // creates a span where the fonts will be loaded
    const createSpan = (fontFamily: string) => {
      const span = document.createElement('span')
      const { style } = span
      style.position = 'absolute'
      style.top = '0'
      style.left = '0'
      style.fontFamily = fontFamily
      span.textContent = testString
      spansContainer.appendChild(span)
      return span
    }

    // creates a span and load the font to detect and a base font for fallback
    const createSpanWithFonts = (fontToDetect: string, baseFont: string) => {
      return createSpan(`'${fontToDetect}',${baseFont}`)
    }

    // creates spans for the base fonts and adds them to baseFontsDiv
    const initializeBaseFontsSpans = () => {
      return baseFonts.map(createSpan)
    }

    // creates spans for the fonts to detect and adds them to fontsDiv
    const initializeFontsSpans = () => {
      // Stores {fontName : [spans for that font]}
      const spans: Record<string, HTMLSpanElement[]> = {}

      for (const font of fontList) {
        spans[font] = baseFonts.map((baseFont) => createSpanWithFonts(font, baseFont))
      }

      return spans
    }

    // checks if a font is available
    const isFontAvailable = (fontSpans: HTMLElement[]) => {
      return baseFonts.some(
        (baseFont, baseFontIndex) =>
          fontSpans[baseFontIndex].offsetWidth !== defaultWidth[baseFont] ||
          fontSpans[baseFontIndex].offsetHeight !== defaultHeight[baseFont],
      )
    }

    // create spans for base fonts
    const baseFontsSpans = initializeBaseFontsSpans()

    // create spans for fonts to detect
    const fontsSpans = initializeFontsSpans()

    // add all the spans to the DOM
    holder.appendChild(spansContainer)

    // get the default width for the three base fonts
    for (let index = 0; index < baseFonts.length; index++) {
      defaultWidth[baseFonts[index]] = baseFontsSpans[index].offsetWidth // width for the default font
      defaultHeight[baseFonts[index]] = baseFontsSpans[index].offsetHeight // height for the default font
    }

    // check available fonts
    return fontList.filter((font) => isFontAvailable(fontsSpans[font]))
  })
}
