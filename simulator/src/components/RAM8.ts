import * as t from "io-ts"
import { colorForBoolean, COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_EMPTY, COLOR_MOUSE_OVER, displayValuesFromArray, drawLabel, drawWireLineToComponent, GRID_STEP, strokeSingleLine } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { FixedArray, FixedArrayFill, FixedArraySize, FixedReadonlyArray, isDefined, isNotNull, isNull, isUndefined, isUnknown, LogicValue, toLogicValueFromChar, toLogicValueRepr, typeOrUndefined, Unknown } from "../utils"
import { ComponentBase, defineComponent } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { EdgeTrigger, Flipflop, makeTriggerItems } from "./FlipflopOrLatch"

const GRID_WIDTH = 11
const GRID_HEIGHT = 15

const INPUT = {
    Clock: 0,
    WriteEnable: 1,
    Clear: 2,
    Data: [3, 4, 5, 6, 7, 8, 9, 10],
    Address: [11, 12, 13, 14],
} as const

const OUTPUT = {
    Q: [0, 1, 2, 3, 4, 5, 6, 7],
}

const WORD_WIDTH = INPUT.Data.length
const NUM_CELLS = Math.pow(2, INPUT.Address.length)

export const RAM16x8Def =
    defineComponent(15, 8, t.type({
        type: t.literal("ram-16x8"),
        showContent: typeOrUndefined(t.boolean),
        trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        content: typeOrUndefined(t.array(t.string)),
    }, "RAM8"))

export type RAM16x8Repr = typeof RAM16x8Def.reprType

const RAMDefaults = {
    showContent: true,
    trigger: EdgeTrigger.rising,
}

type RAMValue<BitWidth extends FixedArraySize> = {
    mem: Array<FixedArray<LogicValue, BitWidth>>
    out: FixedReadonlyArray<LogicValue, BitWidth>
}

// TODO merge with RAM16x4
export class RAM16by8 extends ComponentBase<15, 8, RAM16x8Repr, RAMValue<8>> {

    protected _showContent: boolean = RAMDefaults.showContent
    protected _trigger: EdgeTrigger = RAMDefaults.trigger
    protected _lastClock: LogicValue = Unknown

    private static valueFilledWith(v: LogicValue): RAMValue<8> {
        const mem: Array<FixedArray<LogicValue, 8>> = new Array(NUM_CELLS)
        for (let i = 0; i < NUM_CELLS; i++) {
            mem[i] = FixedArrayFill(v, WORD_WIDTH)
        }
        const out = FixedArrayFill(v, WORD_WIDTH)
        return { mem, out }
    }

    private static savedStateFrom(savedData: RAM16x8Repr | null): RAMValue<8> {
        if (isNull(savedData) || isUndefined(savedData.content)) {
            return RAM16by8.valueFilledWith(false)
        }
        const mem: Array<FixedArray<LogicValue, 8>> = new Array(NUM_CELLS)
        for (let i = 0; i < NUM_CELLS; i++) {
            const row = FixedArrayFill<LogicValue, 8>(false, WORD_WIDTH)
            if (i < savedData.content.length) {
                const savedBits = savedData.content[i].split("")
                const len = savedBits.length
                for (let j = 0; j < WORD_WIDTH; j++) {
                    const jj = len - j - 1
                    if (jj >= 0) {
                        row[j] = toLogicValueFromChar(savedBits[jj])
                    } else {
                        break
                    }
                }
            }
            mem[i] = row
        }
        const out = [...mem[0]] as const
        return { mem, out }
    }


    public constructor(editor: LogicEditor, savedData: RAM16x8Repr | null) {
        super(editor, RAM16by8.savedStateFrom(savedData), savedData, {
            ins: [
                [S.Components.Generic.InputClockDesc, -7, +6, "w"], // Clock
                ["WE (Write Enable)", -2, +8, "s"], // WriteEnable
                [S.Components.Generic.InputClearDesc, +2, +8, "s"], // Clear
                // Data in
                ["D0", -7, -4, "w", "D"],
                ["D1", -7, -3, "w", "D"],
                ["D2", -7, -2, "w", "D"],
                ["D3", -7, -1, "w", "D"],
                ["D4", -7, 0, "w", "D"],
                ["D5", -7, 1, "w", "D"],
                ["D6", -7, 2, "w", "D"],
                ["D7", -7, 3, "w", "D"],
                // Address
                ["Addr0", +3, -8, "n", "Addr"],
                ["Addr1", +1, -8, "n", "Addr"],
                ["Addr2", -1, -8, "n", "Addr"],
                ["Addr3", -3, -8, "n", "Addr"],
            ],
            outs: [
                // Data out
                ["Q0", +7, -4, "e", "Q"],
                ["Q1", +7, -3, "e", "Q"],
                ["Q2", +7, -2, "e", "Q"],
                ["Q3", +7, -1, "e", "Q"],
                ["Q4", +7, 0, "e", "Q"],
                ["Q5", +7, 1, "e", "Q"],
                ["Q6", +7, 2, "e", "Q"],
                ["Q7", +7, 3, "e", "Q"],
            ],
        })
        if (isNotNull(savedData)) {
            this._showContent = savedData.showContent ?? RAMDefaults.showContent
            this._trigger = savedData.trigger ?? RAMDefaults.trigger
        }
        this.setInputsPreferSpike(INPUT.Clock, INPUT.Clear)
    }

    toJSON() {
        return {
            type: "ram-16x8" as const,
            ...this.toJSONBase(),
            showContent: (this._showContent !== RAMDefaults.showContent) ? this._showContent : undefined,
            trigger: (this._trigger !== RAMDefaults.trigger) ? this._trigger : undefined,
            content: this.contentRepr(),
        }
    }

    get componentType() {
        return "ic" as const
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

    private contentRepr(): string[] | undefined {
        const cells: string[] = []
        for (let addr = 0; addr < NUM_CELLS; addr++) {
            const cell = this.value.mem[addr].map(toLogicValueRepr).reverse().join("")
            cells.push(cell)
        }
        for (let addr = NUM_CELLS - 1; addr >= 0; addr--) {
            if (cells[addr] === "00000000") {
                cells.splice(addr, 1)
            } else {
                break
            }
        }
        return cells.length === 0 ? undefined : cells
    }

    public override makeTooltip() {
        const s = S.Components.RAM8.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValue(): RAMValue<8> {
        const clear = this.inputs[INPUT.Clear].value
        if (clear === true) {
            // clear is true, preset is false, set output to 0
            return RAM16by8.valueFilledWith(false)
        }

        // first, determine output
        const addr = this.currentAddress()

        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs[INPUT.Clock].value

        // handle normal operation
        const oldState = this.value
        const we = this.inputs[INPUT.WriteEnable].value
        if (we !== true || !Flipflop.isClockTrigger(this.trigger, prevClock, clock)) {
            // nothing to write, just update output
            const out = isUnknown(addr) ? FixedArrayFill(Unknown, 8) : oldState.mem[addr]
            return { mem: oldState.mem, out }
        }

        // we write
        if (isUnknown(addr)) {
            return RAM16by8.valueFilledWith(Unknown)
        }

        // build new state
        const newData = this.inputValues<8>(INPUT.Data)
        const newState: Array<FixedArray<LogicValue, 8>> = new Array(NUM_CELLS)
        for (let i = 0; i < NUM_CELLS; i++) {
            if (i === addr) {
                newState[i] = newData
            } else {
                newState[i] = oldState.mem[i]
            }
        }
        return { mem: newState, out: newData }
    }

    makeStateAfterClock(): FixedArray<LogicValue, 4> {
        return INPUT.Data.map(i => this.inputs[i].value) as FixedArray<LogicValue, 4>
    }

    private currentAddress(): number | Unknown {
        const addrBits = this.inputValues<4>(INPUT.Address)
        const [__, addr] = displayValuesFromArray(addrBits, false)
        return addr
    }

    protected override propagateValue(newValue: RAMValue<8>) {
        for (let i = 0; i < OUTPUT.Q.length; i++) {
            this.outputs[OUTPUT.Q[i]].value = newValue.out[i]
        }
    }

    protected doSetShowContent(showContent: boolean) {
        this._showContent = showContent
        this.setNeedsRedraw("show content changed")
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }

    doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const width = this.unrotatedWidth
        const height = this.unrotatedHeight
        const left = this.posX - width / 2
        const right = this.posX + width / 2
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
        drawWireLineToComponent(g, this.inputs[INPUT.WriteEnable], this.inputs[INPUT.WriteEnable].posXInParentTransform, bottom + 2, false)
        drawWireLineToComponent(g, this.inputs[INPUT.Clear], this.inputs[INPUT.Clear].posXInParentTransform, bottom + 2, false)
        for (const i of INPUT.Data) {
            drawWireLineToComponent(g, this.inputs[i], left - 1, this.inputs[i].posYInParentTransform, false)
        }
        for (const i of INPUT.Address) {
            drawWireLineToComponent(g, this.inputs[i], this.inputs[i].posXInParentTransform, top, false)
        }

        for (const output of this.outputs) {
            drawWireLineToComponent(g, output, right + 1, output.posYInParentTransform, false)
        }


        ctx.inNonTransformedFrame(ctx => {
            if (!this._showContent || this.editor.options.hideMemoryContent) {
                g.font = `bold 16px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillText("RAM", this.posX, this.posY)
            } else {
                const mem = this.value.mem
                const cellWidth = 8
                const cellHeight = 6
                const contentTop = this.posY - 8 * cellHeight
                const contentLeft = this.posX - 28
                const contentRight = contentLeft + WORD_WIDTH * cellWidth
                const contentBottom = contentTop + NUM_CELLS * cellHeight

                // by default, paint everything as zero
                g.fillStyle = COLOR_EMPTY
                g.fillRect(contentLeft, contentTop, contentRight - contentLeft, contentBottom - contentTop)

                for (let i = 0; i < NUM_CELLS; i++) {
                    for (let j = 0; j < WORD_WIDTH; j++) {
                        const v = mem[i][WORD_WIDTH - j - 1]
                        if (v !== false) {
                            g.fillStyle = colorForBoolean(v)
                            g.fillRect(contentLeft + j * cellWidth, contentTop + i * cellHeight, cellWidth, cellHeight)
                        }
                    }
                }

                g.strokeStyle = COLOR_COMPONENT_BORDER
                g.lineWidth = 0.5
                for (let i = 1; i < NUM_CELLS; i++) {
                    const y = contentTop + i * cellHeight
                    strokeSingleLine(g, contentLeft, y, contentRight, y)
                }
                for (let j = 1; j < WORD_WIDTH; j++) {
                    const x = contentLeft + j * cellWidth
                    strokeSingleLine(g, x, contentTop, x, contentBottom)
                }
                g.lineWidth = 2
                g.strokeRect(contentLeft, contentTop, contentRight - contentLeft, contentBottom - contentTop)
                const addr = this.currentAddress()
                if (!isUnknown(addr)) {
                    const arrowY = contentTop + addr * cellHeight + cellHeight / 2
                    const arrowRight = contentLeft - 3
                    const arrowWidth = 8
                    const arrowHalfHeight = 3
                    g.beginPath()
                    g.moveTo(arrowRight, arrowY)
                    g.lineTo(arrowRight - arrowWidth, arrowY + arrowHalfHeight)
                    g.lineTo(arrowRight - arrowWidth + 2, arrowY)
                    g.lineTo(arrowRight - arrowWidth, arrowY - arrowHalfHeight)
                    g.closePath()
                    g.fillStyle = COLOR_COMPONENT_BORDER
                    g.fill()
                }
            }

            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "12px sans-serif"

            drawLabel(ctx, this.orient, "WE", "s", this.inputs[INPUT.WriteEnable], bottom)
            drawLabel(ctx, this.orient, "Clr", "s", this.inputs[INPUT.Clear], bottom)

            g.font = "bold 12px sans-serif"
            drawLabel(ctx, this.orient, "Addr", "n", this.posX, top, this.inputs[INPUT.Address[0]])
            drawLabel(ctx, this.orient, "D", "w", left, this.posY, this.inputs[INPUT.Data[0]])
            drawLabel(ctx, this.orient, "Q", "e", right, this.posY, this.outputs[OUTPUT.Q[0]])
        })

    }



    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const icon = this._showContent ? "check" : "none"
        const toggleShowOpItem = ContextMenuData.item(icon, S.Components.Generic.contextMenu.ShowContent,
            () => this.doSetShowContent(!this._showContent))

        const items: [ContextMenuItemPlacement, ContextMenuItem][] = [
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", ContextMenuData.sep()],
            ["mid", toggleShowOpItem]]

        const forceOutputItem = this.makeForceOutputsContextMenuItem()
        if (isDefined(forceOutputItem)) {
            items.push(
                ["mid", forceOutputItem]
            )
        }

        return items
    }

}
