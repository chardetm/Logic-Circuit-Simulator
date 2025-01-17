import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, displayValuesFromArray, drawWireLineToComponent, GRID_STEP, strokeAsWireLine } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { FixedArray, FixedArrayFill, FixedArraySize, FixedReadonlyArray, isDefined, isNotNull, isUndefined, isUnknown, LogicValue, typeOrUndefined, Unknown } from "../utils"
import { ComponentBase, ComponentRepr, defineComponent, NodeVisual, NodeVisuals } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { WireStyles } from "./Wire"


type MuxInputIndices<NumInputs extends FixedArraySize> = {
    I: ReadonlyArray<FixedReadonlyArray<number, NumInputs>>, // array of arrays of input indices
    S: ReadonlyArray<number>, // array of indices of selectors
}

type MuxOutputIndices<NumOutputs extends FixedArraySize> = {
    Z: FixedReadonlyArray<number, NumOutputs>, // array of output indices
}

export function defineMux<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize, N extends string>(numInputs: NumInputs, numOutputs: NumOutputs, jsonName: N, className: string) {
    return defineComponent(numInputs, numOutputs, t.type({
        type: t.literal(jsonName),
        showWiring: typeOrUndefined(t.boolean),
    }, className))
}

type MuxRepr<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize> =
    ComponentRepr<NumInputs, NumOutputs> & {
        showWiring: boolean | undefined,
    }

const MuxDefaults = {
    showWiring: true,
}

export abstract class Mux<
    NumInputs extends FixedArraySize,
    NumOutputs extends FixedArraySize,
    Repr extends MuxRepr<NumInputs, NumOutputs>>
    extends ComponentBase<NumInputs, NumOutputs, Repr, FixedArray<LogicValue, NumOutputs>>{

    private static generateInOffsets(numFrom: number, numSel: number, numTo: number): NodeVisual[] {
        const offsets: NodeVisual[] = []

        // left inputs
        const numGroups = numFrom / numTo
        const addByGroupSep = numTo > 1 ? 1 : 0
        const numLeftSlots = numFrom + (numGroups - 1) * addByGroupSep
        let x = -2 - numSel
        let y = -(numLeftSlots - 1)
        const selY = -y + 2
        let groupLetter = "A"
        for (let i = 0; i < numFrom; i++) {
            if (i !== 0 && i % numTo === 0) {
                y += addByGroupSep * 2
                groupLetter = String.fromCharCode(groupLetter.charCodeAt(0) + 1)
            }
            offsets.push([groupLetter + (i % numTo), x, y, "w", groupLetter])
            y += 2
        }

        // bottom input selectors
        x = (numSel - 1)
        for (let s = 0; s < numSel; s++) {
            offsets.push([`S${s}`, x - 2 * s, selY, "s", "S"])
        }
        return offsets
    }

    private static generateOutOffsets<NumOutputs extends FixedArraySize>(numSel: number, numTo: NumOutputs): FixedArray<NodeVisual, NumOutputs> {
        const offsets: NodeVisual[] = []

        // right outputs
        const from = -(numTo - 1)
        const x = 2 + numSel
        for (let i = 0; i < numTo; i++) {
            offsets.push([`Z${i}`, x, from + 2 * i, "e", "Z"])
        }
        return offsets as FixedArray<NodeVisual, NumOutputs>
    }

    protected static generateInputIndices<NumOutputs extends FixedArraySize>(numFrom: number, numSel: number, numTo: NumOutputs): MuxInputIndices<NumOutputs> {
        let ind = 0
        const I: Array<FixedArray<number, NumOutputs>> = []
        const numGroups = Math.ceil(numFrom / numTo)
        for (let g = 0; g < numGroups; g++) {
            const inds: Array<number> = []
            for (let o = 0; o < numTo; o++) {
                inds.push(ind++)
            }
            I.push(inds as FixedArray<number, NumOutputs>)
        }
        const S: Array<number> = []
        for (let s = 0; s < numSel; s++) {
            S.push(ind++)
        }
        return { I, S }
    }

    protected static generateOutputIndices<NumOutputs extends FixedArraySize>(numTo: NumOutputs): MuxOutputIndices<NumOutputs> {
        let ind = 0
        const Z: Array<number> = []
        for (let o = 0; o < numTo; o++) {
            Z.push(ind++)
        }
        return { Z: Z as FixedArray<number, NumOutputs> }
    }

    private static gridWidth(numSel: number): number {
        return 1 + 2 * numSel
    }

    private static gridHeight(numFrom: number, numTo: number): number {
        const numGroups = numFrom / numTo
        const addByGroupSep = numTo > 1 ? 1 : 0
        const numLeftSlots = numFrom + (numGroups - 1) * addByGroupSep
        return 1 + 2 * numLeftSlots
    }

    private readonly gridWidth: number
    private readonly gridHeight: number
    private __INPUT: MuxInputIndices<NumOutputs> | undefined
    private __OUTPUT: MuxOutputIndices<NumOutputs> | undefined

    private _showWiring = MuxDefaults.showWiring

    protected constructor(editor: LogicEditor, savedData: Repr | null,
        public readonly numFrom: number,
        public readonly numSel: number,
        public readonly numTo: NumOutputs,
    ) {
        super(editor, FixedArrayFill(false as LogicValue, numTo), savedData, {
            ins: Mux.generateInOffsets(numFrom, numSel, numTo),
            outs: Mux.generateOutOffsets(numSel, numTo),
        } as unknown as NodeVisuals<NumInputs, NumOutputs>)
        this.gridWidth = Mux.gridWidth(numSel)
        this.gridHeight = Mux.gridHeight(numFrom, numTo)
        if (isNotNull(savedData)) {
            this._showWiring = savedData.showWiring ?? MuxDefaults.showWiring
        }
    }

    override toJSONBase() {
        return {
            ...super.toJSONBase(),
            showWiring: (this._showWiring !== MuxDefaults.showWiring) ? this._showWiring : undefined,
        }
    }

    // lazy loading from subclass because accessed by superclass constructor
    private get INPUT(): MuxInputIndices<NumOutputs> {
        let INPUT = this.__INPUT
        if (isUndefined(INPUT)) {
            INPUT = Object.getPrototypeOf(this).constructor.INPUT
            if (isUndefined(INPUT)) {
                console.log("ERROR: Undefined INPUT indices in Mux subclass")
                throw new Error("INPUT is undefined")
            }
            this.__INPUT = INPUT
        }
        return INPUT
    }

    // lazy loading from subclass because accessed by superclass constructor
    private get OUTPUT(): MuxOutputIndices<NumOutputs> {
        let OUTPUT = this.__OUTPUT
        if (isUndefined(OUTPUT)) {
            OUTPUT = Object.getPrototypeOf(this).constructor.OUTPUT
            if (isUndefined(OUTPUT)) {
                console.log("ERROR: Undefined OUTPUT indices in Mux subclass")
                throw new Error("OUTPUT is undefined")
            }
            this.__OUTPUT = OUTPUT
        }
        return OUTPUT
    }

    public get componentType() {
        return "ic" as const
    }

    get unrotatedWidth() {
        return this.gridWidth * GRID_STEP
    }

    get unrotatedHeight() {
        return this.gridHeight * GRID_STEP
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Mux.tooltip.expand({ from: this.numFrom, to: this.numTo }))
        ))
    }

    protected doRecalcValue(): FixedArray<LogicValue, NumOutputs> {
        const sels = this.inputValues(this.INPUT.S as any)
        const sel = displayValuesFromArray(sels, false)[1]

        if (isUnknown(sel)) {
            return FixedArrayFill(Unknown, this.numTo)
        }
        return this.inputValues<NumOutputs>(this.INPUT.I[sel])
    }

    protected override propagateValue(newValues: FixedArray<LogicValue, NumOutputs>) {
        const Z = this.OUTPUT.Z
        for (let i = 0; i < Z.length; i++) {
            this.outputs[Z[i]].value = newValues[i]
        }
    }

    doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const width = this.gridWidth * GRID_STEP
        const height = this.gridHeight * GRID_STEP
        const left = this.posX - width / 2
        const right = this.posX + width / 2
        const top = this.posY - height / 2
        const bottom = this.posY + height / 2

        // inputs
        for (const GROUP of this.INPUT.I) {
            for (let i = 0; i < GROUP.length; i++) {
                const inputi = this.inputs[GROUP[i]]
                drawWireLineToComponent(g, inputi, left, inputi.posYInParentTransform)
            }
        }

        // selectors
        for (let i = 0; i < this.INPUT.S.length; i++) {
            const seli = this.inputs[this.INPUT.S[i]]
            drawWireLineToComponent(g, seli, seli.posXInParentTransform, top + 20)
        }

        // outputs
        for (let i = 0; i < this.OUTPUT.Z.length; i++) {
            const outputi = this.outputs[this.OUTPUT.Z[i]]
            drawWireLineToComponent(g, outputi, right, outputi.posYInParentTransform)
        }

        // outline
        g.fillStyle = COLOR_BACKGROUND
        g.lineWidth = 3
        if (ctx.isMouseOver) {
            g.strokeStyle = COLOR_MOUSE_OVER
        } else {
            g.strokeStyle = COLOR_COMPONENT_BORDER
        }
        const dy = (right - left) / 3
        g.beginPath()
        g.moveTo(left, top)
        g.lineTo(right, top + dy)
        g.lineTo(right, bottom - dy)
        g.lineTo(left, bottom)
        g.closePath()
        g.fill()
        g.stroke()

        // wiring
        if (this._showWiring) {
            const sels = this.inputValues(this.INPUT.S as any)
            const sel = displayValuesFromArray(sels, false)[1]
            if (!isUnknown(sel)) {
                const neutral = this.editor.options.hideWireColors
                const from = this.INPUT.I[sel]
                const to = this.OUTPUT.Z
                const anchorDiffX = (right - left) / 3
                const wireStyleStraight = this.editor.options.wireStyle === WireStyles.straight

                for (let i = 0; i < from.length; i++) {
                    this.editor.options.wireStyle
                    g.beginPath()
                    const fromY = this.inputs[from[i]].posYInParentTransform
                    const toNode = this.outputs[to[i]]
                    const toY = toNode.posYInParentTransform
                    g.moveTo(left + 2, fromY)
                    if (wireStyleStraight) {
                        g.lineTo(left + 4, fromY)
                        g.lineTo(right - 4, toY)
                        g.lineTo(right - 2, toY)
                    } else {
                        g.bezierCurveTo(
                            left + anchorDiffX, fromY, // anchor left
                            right - anchorDiffX, toY, // anchor right
                            right - 2, toY,
                        )
                    }
                    strokeAsWireLine(g, this.inputs[from[i]].value, toNode.color, false, neutral)
                }
            }
        }

    }

    private doSetShowWiring(showWiring: boolean) {
        this._showWiring = showWiring
        this.setNeedsRedraw("show wiring changed")
    }


    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const icon = this._showWiring ? "check" : "none"
        const toggleShowWiringItem = ContextMenuData.item(icon, S.Components.Mux.contextMenu.ShowWiring, () => {
            this.doSetShowWiring(!this._showWiring)
        })

        const items: [ContextMenuItemPlacement, ContextMenuItem][] = [
            ["mid", toggleShowWiringItem],
        ]

        const forceOutputItem = this.makeForceOutputsContextMenuItem()
        if (isDefined(forceOutputItem)) {
            items.push(
                ["mid", forceOutputItem]
            )
        }

        return items
    }

}



export const Mux2To1Def = defineMux(3, 1, "mux-2to1", "Mux2To1")
export type Mux2To1Repr = typeof Mux2To1Def.reprType
export class Mux2To1 extends Mux<3, 1, Mux2To1Repr> {

    protected static INPUT = Mux.generateInputIndices(2, 1, 1)
    protected static OUTPUT = Mux.generateOutputIndices(1)

    public constructor(editor: LogicEditor, savedData: Mux2To1Repr | null) {
        super(editor, savedData, 2, 1, 1)
    }

    toJSON() {
        return {
            type: "mux-2to1" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Mux4To1Def = defineMux(6, 1, "mux-4to1", "Mux4To1")
export type Mux4To1Repr = typeof Mux4To1Def.reprType
export class Mux4To1 extends Mux<6, 1, Mux4To1Repr> {

    protected static INPUT = Mux.generateInputIndices(4, 2, 1)
    protected static OUTPUT = Mux.generateOutputIndices(1)

    public constructor(editor: LogicEditor, savedData: Mux4To1Repr | null) {
        super(editor, savedData, 4, 2, 1)
    }

    toJSON() {
        return {
            type: "mux-4to1" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Mux8To1Def = defineMux(11, 1, "mux-8to1", "Mux8To1")
export type Mux8To1Repr = typeof Mux8To1Def.reprType
export class Mux8To1 extends Mux<11, 1, Mux8To1Repr> {

    protected static INPUT = Mux.generateInputIndices(8, 3, 1)
    protected static OUTPUT = Mux.generateOutputIndices(1)

    public constructor(editor: LogicEditor, savedData: Mux8To1Repr | null) {
        super(editor, savedData, 8, 3, 1)
    }

    toJSON() {
        return {
            type: "mux-8to1" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Mux4To2Def = defineMux(5, 2, "mux-4to2", "Mux4To2")
export type Mux4To2Repr = typeof Mux4To2Def.reprType
export class Mux4To2 extends Mux<5, 2, Mux4To2Repr> {

    protected static INPUT = Mux.generateInputIndices(4, 1, 2)
    protected static OUTPUT = Mux.generateOutputIndices(2)

    public constructor(editor: LogicEditor, savedData: Mux4To2Repr | null) {
        super(editor, savedData, 4, 1, 2)
    }

    toJSON() {
        return {
            type: "mux-4to2" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Mux8To2Def = defineMux(10, 2, "mux-8to2", "Mux8To2")
export type Mux8To2Repr = typeof Mux8To2Def.reprType
export class Mux8To2 extends Mux<10, 2, Mux8To2Repr> {

    protected static INPUT = Mux.generateInputIndices(8, 2, 2)
    protected static OUTPUT = Mux.generateOutputIndices(2)

    public constructor(editor: LogicEditor, savedData: Mux8To2Repr | null) {
        super(editor, savedData, 8, 2, 2)
    }

    toJSON() {
        return {
            type: "mux-8to2" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Mux8To4Def = defineMux(9, 4, "mux-8to4", "Mux8To4")
export type Mux8To4Repr = typeof Mux8To4Def.reprType
export class Mux8To4 extends Mux<9, 4, Mux8To4Repr> {

    protected static INPUT = Mux.generateInputIndices(8, 1, 4)
    protected static OUTPUT = Mux.generateOutputIndices(4)

    public constructor(editor: LogicEditor, savedData: Mux8To4Repr | null) {
        super(editor, savedData, 8, 1, 4)
    }

    toJSON() {
        return {
            type: "mux-8to4" as const,
            ...this.toJSONBase(),
        }
    }
}
