import { Component, ComponentName } from "./components/Component"
import { DrawContext, DrawContextExt, HasPosition, Orientation } from "./components/Drawable"
import { RectangleColor } from "./components/LabelRect"
import { Node, WireColor } from "./components/Node"
import { LedColor } from "./components/OutputBar"
import { LogicEditor } from "./LogicEditor"
import { isArray, isDefined, isHighImpedance, isNumber, isString, isUndefined, isUnknown, LogicValue, Mode, Unknown } from "./utils"


//
// GRID, GENERAL
//

export const GRID_STEP = 10
export const WIRE_WIDTH = 8
export const WAYPOINT_DIAMETER = 8
const WAYPOINT_HIT_RANGE = WAYPOINT_DIAMETER + 5


export function pxToGrid(x: number) {
    return Math.round(x / GRID_STEP)
}

export function dist(x0: number, y0: number, x1: number, y1: number): number {
    const dx = x1 - x0
    const dy = y1 - y0
    return Math.sqrt(dx * dx + dy * dy)
}

export function inRect(centerX: number, centerY: number, width: number, height: number, pointX: number, pointY: number): boolean {
    const w2 = width / 2
    const h2 = height / 2
    return pointX >= centerX - w2 && pointX < centerX + w2 &&
        pointY >= centerY - h2 && pointY < centerY + h2
}


//
// COLORS
//

export type ColorGreyLevel = number
export type ColorComponentsRGB = [number, number, number]
export type ColorComponentsRGBA = [number, number, number, number]
export type ColorString = string

export let COLOR_BACKGROUND: ColorString
export let COLOR_OFF_BACKGROUND: ColorString
export let COLOR_BACKGROUND_UNUSED_REGION: ColorString
export let COLOR_BACKGROUND_INVALID: ColorString
export let COLOR_BORDER: ColorString
export let COLOR_GRID_LINES: ColorString
export let COLOR_GRID_LINES_GUIDES: ColorString
export let COLOR_LABEL_OFF: ColorString
export let COLOR_LABEL_ON: ColorString
export let COLORCOMP_COMPONENT_BORDER: ColorGreyLevel
export let COLOR_COMPONENT_BORDER: ColorString
export let COLOR_COMPONENT_INNER_LABELS: ColorString
export let COLOR_WIRE_BORDER: ColorString
export let COLOR_MOUSE_OVER: ColorString
export let COLOR_MOUSE_OVER_NORMAL: ColorString
export let COLOR_MOUSE_OVER_DANGER: ColorString
export let COLORCOMPS_FULL: ColorComponentsRGB
export let COLOR_FULL: ColorString
export let COLOR_DARK_RED: ColorString
export let COLORCOMPS_EMPTY: ColorComponentsRGB
export let COLOR_EMPTY: ColorString
export let COLOR_UNKNOWN: ColorString
export let COLOR_HIGH_IMPEDANCE: ColorString
export let COLOR_GATE_NAMES: ColorString
export let COLOR_LED_ON: { [C in LedColor]: ColorString }
export let COLOR_WIRE: { [C in WireColor]: ColorString }
export let COLOR_RECTANGLE_BACKGROUND: { [C in RectangleColor]: ColorString }
export let COLOR_RECTANGLE_BORDER: { [C in RectangleColor]: ColorString }
export let PATTERN_STRIPED_GRAY: CanvasPattern

let _currentModeIsDark = false
doSetColors(_currentModeIsDark)

export function setColors(darkMode: boolean) {
    if (darkMode !== _currentModeIsDark) {
        doSetColors(darkMode)
        for (const editor of LogicEditor.allConnectedEditors) {
            editor.wrapHandler(() => {
                editor.redrawMgr.addReason("dark/light mode switch", null)
            })()
        }
    }
}

function doSetColors(darkMode: boolean) {
    if (!darkMode) {
        // Light Theme
        COLOR_BACKGROUND = ColorString(0xFF)
        COLOR_OFF_BACKGROUND = ColorString(0xDF)
        COLOR_BACKGROUND_INVALID = ColorString([0xFF, 0xBB, 0xBB])
        COLOR_BACKGROUND_UNUSED_REGION = ColorString(0xEE)
        COLOR_BORDER = ColorString(200)
        COLOR_GRID_LINES = ColorString(240)
        COLOR_GRID_LINES_GUIDES = ColorString(215)
        COLOR_LABEL_OFF = ColorString(0xFF)
        COLOR_LABEL_ON = ColorString(0)
        COLORCOMP_COMPONENT_BORDER = 0x00
        COLOR_COMPONENT_INNER_LABELS = ColorString(0xAA)
        COLOR_WIRE_BORDER = ColorString(80)
        COLOR_MOUSE_OVER_NORMAL = ColorString([0, 0x7B, 0xFF])
        COLOR_MOUSE_OVER_DANGER = ColorString([194, 34, 14])
        COLORCOMPS_FULL = [255, 193, 7]
        COLOR_DARK_RED = ColorString([180, 0, 0])
        COLORCOMPS_EMPTY = [52, 58, 64]
        COLOR_UNKNOWN = ColorString([152, 158, 164])
        COLOR_HIGH_IMPEDANCE = ColorString([137, 114, 35])
        COLOR_GATE_NAMES = ColorString([190, 190, 190])
        COLOR_LED_ON = {
            green: ColorString([20, 232, 20]),
            red: ColorString([232, 20, 20]),
            yellow: ColorString([232, 232, 20]),
        }
        COLOR_WIRE = {
            black: COLOR_WIRE_BORDER,
            red: ColorString([206, 63, 57]),
            blue: ColorString([77, 102, 153]),
            yellow: ColorString([245, 209, 63]),
            green: ColorString([87, 136, 97]),
            white: ColorString([230, 217, 199]),
        }
        PATTERN_STRIPED_GRAY = createStripedPattern(COLOR_BACKGROUND, "rgba(128,128,128,0.2)")

    } else {
        // Dark Theme
        COLOR_BACKGROUND = ColorString([19, 20, 22])
        COLOR_OFF_BACKGROUND = ColorString(60)
        COLOR_BACKGROUND_INVALID = ColorString([0xA8, 0x14, 0x14])
        COLOR_BACKGROUND_UNUSED_REGION = ColorString(55)
        COLOR_BORDER = ColorString(0x55)
        COLOR_GRID_LINES = ColorString(30)
        COLOR_GRID_LINES_GUIDES = ColorString(45)
        COLOR_LABEL_OFF = ColorString(185)
        COLOR_LABEL_ON = COLOR_BACKGROUND
        COLORCOMP_COMPONENT_BORDER = 200
        COLOR_COMPONENT_INNER_LABELS = ColorString(0x8B)
        COLOR_WIRE_BORDER = ColorString(175)
        COLOR_MOUSE_OVER_NORMAL = ColorString([0, 0x7B, 0xFF])
        COLOR_MOUSE_OVER_DANGER = ColorString([194, 34, 14])
        COLORCOMPS_FULL = [255, 193, 7]
        COLOR_DARK_RED = ColorString([180, 0, 0])
        COLORCOMPS_EMPTY = [80, 89, 99]
        COLOR_UNKNOWN = ColorString([108, 106, 98])
        COLOR_HIGH_IMPEDANCE = ColorString([103, 84, 23])
        COLOR_GATE_NAMES = ColorString([95, 95, 95])
        COLOR_LED_ON = {
            green: ColorString([11, 144, 11]),
            red: ColorString([144, 11, 11]),
            yellow: ColorString([144, 144, 11]),
        }
        COLOR_WIRE = {
            black: COLOR_WIRE_BORDER,
            red: ColorString([206, 63, 57]), // TODO update these colors below
            blue: ColorString([77, 102, 153]),
            yellow: ColorString([245, 209, 63]),
            green: ColorString([87, 136, 97]),
            white: ColorString([230, 217, 199]),
        }

        PATTERN_STRIPED_GRAY = createStripedPattern(COLOR_BACKGROUND, "rgba(128,128,128,0.4)")

    }

    // same for both light and dark theme thanks to alpha
    COLOR_RECTANGLE_BACKGROUND = {
        yellow: ColorString([230, 230, 0, 0.2]),
        blue: ColorString([54, 54, 255, 0.2]),
        green: ColorString([54, 255, 54, 0.2]),
        red: ColorString([255, 54, 54, 0.2]),
        grey: ColorString([120, 120, 120, 0.2]),
        turquoise: ColorString([0, 210, 210, 0.2]),
    }
    COLOR_RECTANGLE_BORDER = {
        yellow: ColorString([196, 196, 0, 0.5]),
        blue: ColorString([115, 115, 255, 0.5]),
        green: ColorString([0, 167, 0, 0.5]),
        red: ColorString([214, 0, 0, 0.5]),
        grey: ColorString([35, 35, 35, 0.5]),
        turquoise: ColorString([0, 162, 162, 0.5]),
    }
    COLOR_COMPONENT_BORDER = ColorString(COLORCOMP_COMPONENT_BORDER)
    setColorMouseOverIsDanger(false)
    COLOR_FULL = ColorString(COLORCOMPS_FULL)
    COLOR_EMPTY = ColorString(COLORCOMPS_EMPTY)

    _currentModeIsDark = darkMode
}

function createStripedPattern(background: ColorString, stripeColor: string) {
    const canvas = document.createElement("canvas")
    const step = 4
    canvas.width = 2 * step
    canvas.height = 6 * step
    const g = canvas.getContext("2d")!
    g.fillStyle = background
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.fillStyle = stripeColor
    g.beginPath()
    g.moveTo(step, 0)
    g.lineTo(canvas.width, 0)
    g.lineTo(0, canvas.height)
    g.lineTo(0, 3 * step)
    g.closePath()
    g.moveTo(step, canvas.height)
    g.lineTo(canvas.width, canvas.height)
    g.lineTo(canvas.width, 3 * step)
    g.closePath()
    g.fill()
    const pattern = g.createPattern(canvas, "repeat")
    if (pattern === null) {
        console.log("Failed to create pattern")
    }
    return pattern!
}

export function setColorMouseOverIsDanger(mouseOverIsDanger: boolean) {
    COLOR_MOUSE_OVER = mouseOverIsDanger ? COLOR_MOUSE_OVER_DANGER : COLOR_MOUSE_OVER_NORMAL
}

export function ColorString(input: ColorGreyLevel | ColorComponentsRGB | ColorComponentsRGBA): ColorString {
    if (isArray(input)) {
        if (input.length === 3) {
            return `rgb(${input[0]},${input[1]},${input[2]})`
        }
        // else, rgba
        return `rgba(${input[0]},${input[1]},${input[2]},${input[3]})`
    }
    // else, grey
    return `rgb(${input},${input},${input})`
}

export function colorComps(c: ColorString) {
    const PREFIX = "rgb("
    if (c.startsWith(PREFIX)) {
        c = c.substring(PREFIX.length)
    }
    const SUFFIX = ")"
    if (c.endsWith(SUFFIX)) {
        c = c.substring(0, c.length - SUFFIX.length)
    }
    return c.split(',').map(compStr => parseInt(compStr))
}

export function colorForBoolean(value: LogicValue): ColorString {
    return isUnknown(value) ? COLOR_UNKNOWN : isHighImpedance(value) ? COLOR_HIGH_IMPEDANCE : value ? COLOR_FULL : COLOR_EMPTY
}

export function colorForFraction(fraction: number): ColorString {
    const c: ColorComponentsRGB = [
        (COLORCOMPS_FULL[0] - COLORCOMPS_EMPTY[0]) * fraction + COLORCOMPS_EMPTY[0],
        (COLORCOMPS_FULL[1] - COLORCOMPS_EMPTY[1]) * fraction + COLORCOMPS_EMPTY[1],
        (COLORCOMPS_FULL[2] - COLORCOMPS_EMPTY[2]) * fraction + COLORCOMPS_EMPTY[2],
    ]
    return ColorString(c)
}


//
// FONTS
//

export const FONT_LABEL_DEFAULT = "18px sans-serif"


//
// DRAWING
//

// Adding to current path

export function triangle(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.lineTo(x2, y2)
    g.closePath()
}

export function circle(g: CanvasRenderingContext2D, cx: number, cy: number, d: number) {
    const r = d / 2
    g.ellipse(cx, cy, r, r, 0, 0, 2 * Math.PI)
}

// Stroking/filling

export function strokeSingleLine(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.stroke()
}

export function strokeBezier(g: CanvasRenderingContext2D, x0: number, y0: number, anchorX0: number, anchorY0: number, anchorX1: number, anchorY1: number, x1: number, y1: number) {
    g.beginPath()
    g.moveTo(x0, y0)
    g.bezierCurveTo(anchorX0, anchorY0, anchorX1, anchorY1, x1, y1)
    g.stroke()
}

export function shouldShowNode(node: Node): boolean {
    const editor = node.editor
    if (editor.mode <= Mode.TRYOUT && !editor.options.showDisconnectedPins && node.isDisconnected) {
        return false
    }
    return true
}

export function drawWireLineToComponent(g: CanvasRenderingContext2D, node: Node, x1: number, y1: number, withTriangle = false) {
    if (!shouldShowNode(node)) {
        return
    }
    const neutral = node.editor.options.hideWireColors
    const x0 = node.posXInParentTransform
    const y0 = node.posYInParentTransform
    drawStraightWireLine(g, x0, y0, x1, y1, node.value, node.color, neutral)
    if (withTriangle) {
        g.strokeStyle = COLOR_COMPONENT_BORDER
        g.fillStyle = COLOR_COMPONENT_BORDER
        g.beginPath()
        const shift = node.isOutput ? 2 : -1
        if (x0 === x1) {
            // vertical line
            const pointsDown = (node.isOutput && y1 <= y0) || (!node.isOutput && y0 <= y1)
            if (pointsDown) {
                triangle(g,
                    x1 - 3, y1 - 2 + shift,
                    x1 + 3, y1 - 2 + shift,
                    x1, y1 + 1 + shift,
                )
            } else {
                triangle(g,
                    x1 - 3, y1 - 2 - shift,
                    x1 + 3, y1 - 2 - shift,
                    x1, y1 - 5 - shift,
                )
            }
        } else if (y0 === y1) {
            // horizontal line
            const pointsRight = (node.isOutput && x1 <= x0) || (!node.isOutput && x0 <= x1)
            if (pointsRight) {
                triangle(g,
                    x1 - 2 + shift, y1 - 3,
                    x1 - 2 + shift, y1 + 3,
                    x1 + 1 + shift, y1,
                )
            } else {
                triangle(g,
                    x1 + 2 - shift, y1 - 3,
                    x1 + 2 - shift, y1 + 3,
                    x1 - 1 - shift, y1,
                )
            }
        } else {
            console.log(`ERROR  wireLineToComponent cannot draw triangle as line is not vertical or horizontal between (${x0}, ${y0}) and (${x1}, ${y1})`)
        }
        g.fill()
        g.stroke()
    }
}

export function drawStraightWireLine(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, value: LogicValue, color: WireColor, neutral: boolean) {
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    strokeAsWireLine(g, value, color, false, neutral)
}

export function strokeAsWireLine(g: CanvasRenderingContext2D, value: LogicValue, color: WireColor, isMouseOver: boolean, neutral: boolean, path?: Path2D) {
    const oldLineCap = g.lineCap
    g.lineCap = "butt"

    const mainStrokeWidth = WIRE_WIDTH / 2
    if (isMouseOver) {
        g.lineWidth = mainStrokeWidth + 2
        g.strokeStyle = COLOR_MOUSE_OVER
    } else {
        g.lineWidth = mainStrokeWidth
        g.strokeStyle = COLOR_WIRE[color]
    }
    if (path) { g.stroke(path) }
    else { g.stroke() }

    g.strokeStyle = neutral ? COLOR_UNKNOWN : colorForBoolean(value)
    g.lineWidth = mainStrokeWidth - 2
    if (path) { g.stroke(path) }
    else { g.stroke() }

    g.lineCap = oldLineCap
}

export function isOverWaypoint(x: number, y: number, waypointX: number, waypointY: number): boolean {
    return dist(x, y, waypointX, waypointY) < WAYPOINT_HIT_RANGE / 2
}

export function drawWaypoint(g: CanvasRenderingContext2D, ctx: DrawContext, x: number, y: number, value: LogicValue, isMouseOver: boolean, neutral: boolean, showForced: boolean, showForcedWarning: boolean, parentOrientIsVertical: boolean) {
    g.fillStyle = neutral ? COLOR_UNKNOWN : colorForBoolean(value)

    const [circleColor, thickness] =
        showForced
            ? [COLOR_DARK_RED, 3] // show forced nodes with red border if not in teacher mode
            : [COLOR_WIRE_BORDER, 1]   // show normally

    g.strokeStyle = circleColor
    g.lineWidth = thickness
    g.beginPath()
    circle(g, x, y, WAYPOINT_DIAMETER)
    g.fill()
    g.stroke()

    if (isMouseOver) {
        g.fillStyle = "rgba(128,128,128,0.5)"
        g.beginPath()
        circle(g, x, y, WAYPOINT_DIAMETER * 2)
        g.fill()
        g.stroke()
    }

    if (showForcedWarning) {
        // forced value to something that is contrary to normal output
        g.textAlign = "center"
        g.fillStyle = circleColor
        g.font = "bold 14px sans-serif"

        ctx.inNonTransformedFrame(ctx => {
            g.fillText("!!", ...ctx.rotatePoint(
                x + (parentOrientIsVertical ? 13 : 0),
                y + (parentOrientIsVertical ? 0 : -13),
            ))
        })
    }
}

export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: number, y: Node): void
export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: Node, y: number): void
export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: number, y: number, referenceNode: Node | undefined): void

export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: number | Node, y: number | Node, referenceNode?: Node) {
    if (isUndefined(text)) {
        return
    }

    let nodeHidden = false
    if (isUndefined(referenceNode)) {
        if (!isNumber(x)) {
            referenceNode = x
        } else if (!isNumber(y)) {
            referenceNode = y
        }
    }
    if (isDefined(referenceNode)) {
        nodeHidden = !shouldShowNode(referenceNode)
    }
    if (nodeHidden) {
        return
    }

    // we assume a color and a font have been set before this function is called
    const [halign, valign, dx, dy] = (() => {
        if (isUndefined(anchor)) {
            return ["center", "middle", 0, 0] as const
        }
        const rotatedAnchor = Orientation.add(compOrient, anchor)
        switch (rotatedAnchor) {
            case "e": return ["right", "middle", -3, 0] as const
            case "w": return ["left", "middle", 3, 0] as const
            case "n": return ["center", "top", 0, 2] as const
            case "s": return ["center", "bottom", 0, -2] as const
        }
    })()

    const xx = (isNumber(x) ? x : x.posXInParentTransform)
    const yy = (isNumber(y) ? y : y.posYInParentTransform)
    const [finalX, finalY] = ctx.rotatePoint(xx, yy)

    const g = ctx.g
    g.textAlign = halign
    g.textBaseline = valign
    g.fillText(text, finalX + dx, finalY + dy)
}

export function drawRoundValueCentered(g: CanvasRenderingContext2D, value: LogicValue, comp: HasPosition, opts?: { fillStyle?: string, small?: boolean }) {
    drawRoundValue(g, value, comp.posX, comp.posY, opts)
}

export function drawRoundValue(g: CanvasRenderingContext2D, value: LogicValue, x: number, y: number, opts?: { fillStyle?: string, small?: boolean }) {
    g.textAlign = "center"
    g.textBaseline = "middle"

    let spec = ""
    let label = ""

    const small = opts?.small ?? false
    const fillStyle = opts?.fillStyle

    const sizeStrBig = small ? "12" : "18"
    const sizeStrSmall = small ? "10" : "16"

    if (isUnknown(value)) {
        g.fillStyle = fillStyle ?? COLOR_LABEL_OFF
        spec = "bold " + sizeStrBig
        label = '?'
    } else if (isHighImpedance(value)) {
        g.fillStyle = fillStyle ?? COLOR_LABEL_OFF
        spec = sizeStrSmall
        label = 'Z'
    } else if (value) {
        g.fillStyle = fillStyle ?? COLOR_LABEL_ON
        spec = "bold " + sizeStrBig
        label = '1'
    } else {
        g.fillStyle = fillStyle ?? COLOR_LABEL_OFF
        spec = sizeStrBig
        label = '0'
    }
    g.font = `${spec}px sans-serif`
    g.fillText(label, x, y)
}


//
// MISC
//

export const INPUT_OUTPUT_DIAMETER = 26

const NAME_POSITION_SETTINGS = {
    right: ["start", "middle", 7],
    left: ["end", "middle", 9],
    top: ["center", "bottom", 5],
    bottom: ["center", "top", 5],
} as const

function textSettingsForName(onRight: boolean, orient: Orientation) {
    if (onRight) {
        switch (orient) {
            case "e": return NAME_POSITION_SETTINGS.right
            case "w": return NAME_POSITION_SETTINGS.left
            case "n": return NAME_POSITION_SETTINGS.top
            case "s": return NAME_POSITION_SETTINGS.bottom
        }
    } else {
        switch (orient) {
            case "e": return NAME_POSITION_SETTINGS.left
            case "w": return NAME_POSITION_SETTINGS.right
            case "n": return NAME_POSITION_SETTINGS.bottom
            case "s": return NAME_POSITION_SETTINGS.top
        }
    }
}

export function drawComponentName(g: CanvasRenderingContext2D, ctx: DrawContextExt, name: ComponentName, value: string | number, comp: Component, onRight: boolean) {
    if (isUndefined(name)) {
        return
    }

    let displayName
    if (isString(name)) {
        displayName = name
    } else {
        // dynamic name
        if (value in name) {
            displayName = `${value}: ${name[value]}`
        } else if ("default" in name) {
            displayName = `${value}: ${name.default}`
        } else if (isUnknown(value)) {
            displayName = Unknown
        } else {
            displayName = undefined
        }
    }

    if (isUndefined(displayName)) {
        return
    }

    const [hAlign, vAlign, deltaX] = textSettingsForName(onRight, comp.orient)
    g.textAlign = hAlign
    g.textBaseline = vAlign
    g.font = "italic 18px sans-serif"
    g.fillStyle = COLOR_COMPONENT_BORDER
    const point = ctx.rotatePoint(comp.posX + (onRight ? 1 : -1) * (comp.unrotatedWidth / 2 + deltaX), comp.posY)
    g.fillText(displayName, ...point)
    g.textBaseline = "middle" // restore
}

export function displayValuesFromArray(values: readonly LogicValue[], mostSignificantFirst: boolean): [string, number | Unknown] {
    // lowest significant bit is the first bit
    let binaryStringRep = ""
    let hasUnset = false
    const add: (v: any) => void = mostSignificantFirst
        ? v => binaryStringRep = binaryStringRep + v
        : v => binaryStringRep = v + binaryStringRep

    for (const value of values) {
        if (isUnknown(value) || isHighImpedance(value)) {
            hasUnset = true
            add(value)
        } else {
            add(+value)
        }
    }
    const value = hasUnset ? Unknown : parseInt(binaryStringRep, 2)
    return [binaryStringRep, value]
}

export function formatWithRadix(value: number | Unknown, radix: number, width: number, withPrefix = true): string {
    if (isUnknown(value)) {
        return Unknown
    }
    if (radix === -10) {
        // signed int
        const asBinStr = (value >>> 0).toString(2).padStart(width, '0')
        if (asBinStr[0] === '1') {
            // negative
            const rest = parseInt(asBinStr.substring(1), 2)
            // swap hyphen for minus sign as en-dash
            return '–' + String(-(-Math.pow(2, width - 1) + rest))
        } else {
            return String(value)
        }
    } else {
        const caption = value.toString(radix).toUpperCase()
        const prefix = !withPrefix ? "" : (() => {
            switch (radix) {
                case 16: return "0x"
                case 8: return "0o"
                case 2: return "0b"
                default: return ""
            }
        })()
        return prefix + caption
    }
}
