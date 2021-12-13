import { FixedArray, isNotNull, isNull, isUndefined, isUnset, repeatString, RichStringEnum, toTriState, toTriStateRepr, TriState, TriStateRepr, typeOrUndefined, Unset } from "../utils"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_MOUSE_OVER, displayValuesFromArray, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { tooltipContent, mods, div } from "../htmlgen"
import { EdgeTrigger, Flipflop } from "./FlipflopOrLatch"
import * as t from "io-ts"
import { ComponentBase, defineComponent } from "./Component"
import { DisplayAscii } from "./DisplayAscii"

const GRID_WIDTH = 25
const GRID_HEIGHT = 5

const enum INPUT {
    Clock,
    Clear,
    Data,
}


export const ShiftBufferDecoders_ = {
    "raw": { decodeWidth: 1, maxDisplayWidth: 16, decode: (v: number) => v.toString() },
    "octal": { decodeWidth: 3, maxDisplayWidth: 16, decode: (v: number) => v.toString() },
    "hex": { decodeWidth: 4, maxDisplayWidth: 16, decode: (v: number) => v.toString(16).toUpperCase() },
    "ascii": { decodeWidth: 7, maxDisplayWidth: 12, decode: (v: number) => DisplayAscii.numberToAscii(v) },
    "ascii8": { decodeWidth: 8, maxDisplayWidth: 12, decode: (v: number) => DisplayAscii.numberToAscii(v & 0x7F) },
    "uint4": { decodeWidth: 4, maxDisplayWidth: 8, decode: (v: number) => v.toString() },
    "int4": { decodeWidth: 4, maxDisplayWidth: 8, decode: (v: number) => (v > 7 ? v - 16 : v).toString() },
    "uint8": { decodeWidth: 8, maxDisplayWidth: 4, decode: (v: number) => v.toString() },
    "int8": { decodeWidth: 8, maxDisplayWidth: 4, decode: (v: number) => (v > 127 ? v - 256 : v).toString() },
    "uint16": { decodeWidth: 16, maxDisplayWidth: 1, decode: (v: number) => v.toString() },
    "int16": { decodeWidth: 16, maxDisplayWidth: 1, decode: (v: number) => (v > 32767 ? v - 65536 : v).toString() },
} as const

type ShiftBufferDecoderProps = {
    decodeWidth: number,
    maxDisplayWidth: number,
    decode: (n: number) => string,
}

export const ShiftBufferDecoders =
    RichStringEnum.withProps<ShiftBufferDecoderProps>()(ShiftBufferDecoders_)

export type ShiftBufferDecoder = keyof typeof ShiftBufferDecoders_

export const ShiftBufferOutDef =
    defineComponent(3, 0, t.type({
        type: t.literal("shiftbufferout"),
        state: typeOrUndefined(t.array(TriStateRepr)),
        decodeAs: typeOrUndefined(t.keyof(ShiftBufferDecoders_)),
        groupEvery: typeOrUndefined(t.number),
        maxItems: typeOrUndefined(t.number),
        trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
    }, "Register"))

export type ShiftBufferOutRepr = typeof ShiftBufferOutDef.reprType

const ShiftBufferOutDefaults = {
    decodeAs: "raw" as ShiftBufferDecoder,
    trigger: EdgeTrigger.rising,
}

type ShiftBufferOutState = {
    incoming: TriState[]
    decoded: [string, TriState[]][]
}

export class ShiftBufferOut extends ComponentBase<3, 0, ShiftBufferOutRepr, ShiftBufferOutState> {

    protected _decodeAs: ShiftBufferDecoder = ShiftBufferOutDefaults.decodeAs
    protected _groupEvery: number | undefined = undefined
    protected _maxItems: number | undefined = undefined
    protected _trigger: EdgeTrigger = ShiftBufferOutDefaults.trigger
    protected _lastClock: TriState = Unset

    private static savedStateFrom(savedData: { state: Array<TriStateRepr> | undefined } | null): ShiftBufferOutState {
        if (isNull(savedData) || isUndefined(savedData.state)) {
            return { incoming: [], decoded: [] }
        }
        return { incoming: savedData.state.map(t => toTriState(t)), decoded: [] }
    }

    public constructor(savedData: ShiftBufferOutRepr | null) {
        super(ShiftBufferOut.savedStateFrom(savedData), savedData, {
            inOffsets: [
                [-14, +1, "w"], // Clock
                [-10, +3, "s"], // Clear
                [-14, -1, "w"], // Data in
            ],
        })
        if (isNotNull(savedData)) {
            this._decodeAs = savedData.decodeAs ?? ShiftBufferOutDefaults.decodeAs
            this._maxItems = savedData.maxItems
            this._trigger = savedData.trigger ?? ShiftBufferOutDefaults.trigger
        }
        this.setInputsPreferSpike(INPUT.Clock, INPUT.Clear)
        this.redecodeAll()
    }

    toJSON() {
        return {
            type: "shiftbufferout" as const,
            ...this.toJSONBase(),
            state: allBitsOf(this.value).map(b => toTriStateRepr(b)),
            decodeAs: (this._decodeAs !== ShiftBufferOutDefaults.decodeAs) ? this._decodeAs : undefined,
            groupEvery: this._groupEvery,
            maxItems: this._maxItems,
            trigger: (this._trigger !== ShiftBufferOutDefaults.trigger) ? this._trigger : undefined,
        }
    }

    get componentType() {
        return "IC" as const
    }

    get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    get unrotatedHeight() {
        return GRID_HEIGHT * GRID_STEP
    }

    get trigger() {
        return this._trigger
    }

    override getInputName(i: number): string | undefined {
        switch (i) {
            case INPUT.Clock: return "Clock (horloge)"
            case INPUT.Clear: return "C (Clear, effacement)"
            case INPUT.Data: return "D (Données)"
        }
        return undefined
    }

    public override makeTooltip() {
        return tooltipContent("Affichage à décalage", mods(
            div(JSON.stringify(this.value)) // TODO more info
        ))
    }

    protected doRecalcValue(): ShiftBufferOutState {
        if (this.inputs[INPUT.Clear].value === true) {
            return { incoming: [], decoded: [] }
        }
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs[INPUT.Clock].value
        const oldValue = this.value

        if (Flipflop.isClockTrigger(this._trigger, prevClock, clock)) {
            const newBit = this.inputs[INPUT.Data].value
            const decoder = ShiftBufferDecoders.propsOf(this._decodeAs)
            const maxItems = this._maxItems ?? decoder.maxDisplayWidth
            return ShiftBufferOut.valueByAddingNewBit(newBit, oldValue, decoder, maxItems)
        }
        return oldValue
    }

    private static valueByAddingNewBit(newBit: TriState, oldValue: ShiftBufferOutState, decoder: ShiftBufferDecoderProps, maxItems: number): ShiftBufferOutState {
        const newIncoming = [newBit, ...oldValue.incoming]
        if (newIncoming.length < decoder.decodeWidth) {
            return { incoming: newIncoming, decoded: oldValue.decoded }
        }
        const valAsInt = displayValuesFromArray(newIncoming, true)[1]
        const decoded = isUnset(valAsInt) ? Unset : decoder.decode(valAsInt)
        const newDecoded: ShiftBufferOutState["decoded"] = [[decoded, newIncoming], ...oldValue.decoded]
        if (newDecoded.length > maxItems) {
            newDecoded.splice(maxItems, newDecoded.length - maxItems)
        }
        return { incoming: [], decoded: newDecoded }
    }


    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }

    doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const width = this.unrotatedWidth
        const height = this.unrotatedHeight
        const left = this.posX - width / 2
        const top = this.posY - height / 2
        const bottom = this.posY + height / 2

        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 3

        g.beginPath()
        g.rect(left, top, width, height)
        g.fill()
        g.stroke()
        g.fillStyle = COLOR_BACKGROUND

        Flipflop.drawClockInput(g, left, this.inputs[INPUT.Clock], this._trigger)
        drawWireLineToComponent(g, this.inputs[INPUT.Clear], this.inputs[INPUT.Clear].posXInParentTransform, bottom + 2, false)
        drawWireLineToComponent(g, this.inputs[INPUT.Data], left - 2, this.inputs[INPUT.Data].posYInParentTransform, false)

        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.textAlign = "center"
            g.font = "12px sans-serif"

            g.fillText("C", ...ctx.rotatePoint(this.inputs[INPUT.Clear].posXInParentTransform, bottom - 8))

            g.font = "bold 12px sans-serif"
            g.fillText("D", ...ctx.rotatePoint(left + 8, this.inputs[INPUT.Data].posYInParentTransform))

        })

        const drawContents = () => {
            const text = this.makeRepresentationString()
            let toDraw
            if (isUndefined(text)) {
                g.fillStyle = COLOR_COMPONENT_INNER_LABELS
                g.font = "15px sans-serif"
                toDraw = "(vide)"
            } else {
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.font = "bold 16px sans-serif"
                toDraw = text
            }
            g.fillText(toDraw, this.posX, this.posY)
        }

        if (this.orient === "w") {
            ctx.inNonTransformedFrame(drawContents)
        } else {
            drawContents()
        }
    }

    private makeRepresentationString() {
        const { incoming, decoded } = this.value
        if (incoming.length === 0 && decoded.length === 0) {
            return undefined
        }

        const decodeAs = this._decodeAs
        const decoder = ShiftBufferDecoders.propsOf(decodeAs)
        const toPad = decoder.decodeWidth - incoming.length
        const padding = repeatString("_ ", toPad)
        const undecodedStr = padding + displayValuesFromArray(incoming, true)[0]

        const sep = decodeAs.includes("int") ? " " : ""

        let fullDecodedStr
        if (decoded.length === 0) {
            fullDecodedStr = "…"
        } else {
            const groupEvery = this._groupEvery ?? 0
            if (groupEvery < 2) {
                fullDecodedStr = decoded.map(v => v[0]).join(sep)
            } else {
                const offset = groupEvery - (decoded.length % groupEvery)
                const decodedParts: string[] = []
                for (let i = 0; i < decoded.length; i++) {
                    if (i !== 0) {
                        if ((i + offset) % groupEvery === 0) {
                            decodedParts.push(sep + " ")
                        } else {
                            decodedParts.push(sep)
                        }
                    }
                    decodedParts.push(decoded[i][0])
                }
                fullDecodedStr = decodedParts.join("")
            }
            if (decodeAs === "hex") {
                fullDecodedStr = "0x" + (groupEvery < 2 ? "" : " ") + fullDecodedStr
            } else if (decodeAs === "octal") {
                fullDecodedStr = "0o" + (groupEvery < 2 ? "" : " ") + fullDecodedStr
            }
        }

        if (decodeAs === "raw") {
            return fullDecodedStr
        }
        return undecodedStr + " ➟ " + fullDecodedStr
    }

    private redecodeAll() {
        const decoder = ShiftBufferDecoders.propsOf(this._decodeAs)
        const allBits = allBitsOf(this.value)
        const maxItems = this._maxItems ?? decoder.maxDisplayWidth
        let value: ShiftBufferOutState = { incoming: [], decoded: [] }
        for (const newBit of allBits.reverse()) {
            value = ShiftBufferOut.valueByAddingNewBit(newBit, value, decoder, maxItems)
        }
        this.doSetValue(value)
    }

    private doSetDecodeAs(decodeAs: ShiftBufferDecoder) {
        this._decodeAs = decodeAs
        this.redecodeAll() // will call setNeedsRedraw
    }

    private doSetGroupEvery(groupEvery: number | undefined) {
        this._groupEvery = groupEvery
        this.setNeedsRedraw("grouping changed")
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        // TODO merge with FlipFlip items
        const makeTriggerItem = (trigger: EdgeTrigger, desc: string) => {
            const isCurrent = this._trigger === trigger
            const icon = isCurrent ? "check" : "none"
            const caption = "Stocker au " + desc
            const action = isCurrent ? () => undefined :
                () => this.doSetTrigger(trigger)
            return ContextMenuData.item(icon, caption, action)
        }

        const makeItemDecodeAs = (decoder: ShiftBufferDecoder, desc: string) => {
            const isCurrent = this._decodeAs === decoder
            const icon = isCurrent ? "check" : "none"
            return ContextMenuData.item(icon, desc, () => this.doSetDecodeAs(decoder))
        }

        const makeItemGroupEvery = (groupEvery: number | undefined, desc: string) => {
            const isCurrent = this._groupEvery === groupEvery
            const icon = isCurrent ? "check" : "none"
            return ContextMenuData.item(icon, desc, () => this.doSetGroupEvery(groupEvery))
        }

        return [
            ["mid", makeTriggerItem(EdgeTrigger.rising, "flanc montant")],
            ["mid", makeTriggerItem(EdgeTrigger.falling, "flanc descendant")],
            ["mid", ContextMenuData.sep()],
            ["mid", ContextMenuData.submenu("eye", "Décodage", [
                makeItemDecodeAs("raw", "Aucun"),
                makeItemDecodeAs("octal", "Octal"),
                makeItemDecodeAs("hex", "Hexadécimal"),
                makeItemDecodeAs("ascii", "ASCII (7 bits)"),
                makeItemDecodeAs("ascii8", "ASCII (8 bits)"),
                makeItemDecodeAs("uint4", "Entier sur 4 bits"),
                makeItemDecodeAs("int4", "Entier signé sur 4 bits"),
                makeItemDecodeAs("uint8", "Entier sur 8 bits"),
                makeItemDecodeAs("int8", "Entier signé sur 8 bits"),
                makeItemDecodeAs("uint16", "Entier sur 16 bits"),
                makeItemDecodeAs("int16", "Entier signé sur 16 bits"),
                ContextMenuData.sep(),
                ContextMenuData.text("Attention, changer le décodage peut tronquer la valeur stockée"),
            ])],
            ["mid", ContextMenuData.submenu("object-group", "Regrouper les données", [
                makeItemGroupEvery(undefined, "Pas de regroupement"),
                ContextMenuData.sep(),
                makeItemGroupEvery(2, "Par 2"),
                makeItemGroupEvery(3, "Par 3"),
                makeItemGroupEvery(4, "Par 4"),
                makeItemGroupEvery(7, "Par 7"),
                makeItemGroupEvery(8, "Par 8"),
                makeItemGroupEvery(16, "Par 16"),
            ])],
        ]
    }
}

function allBitsOf({ incoming, decoded }: ShiftBufferOutState): TriState[] {
    const allBits = [...incoming]
    for (const [__stringRep, bits] of decoded) {
        allBits.push(...bits)
    }
    return allBits
}