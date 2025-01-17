import * as t from "io-ts"
import { colorForBoolean, COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, drawComponentName, drawRoundValue, drawWireLineToComponent, GRID_STEP, inRect } from "../drawutils"
import { mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { FixedArray, FixedArrayFill, isDefined, isNotNull, isNull, isUndefined, LogicValue, Mode, toLogicValueFromChar, toLogicValueRepr, typeOrUndefined, Unknown } from "../utils"
import { ComponentBase, ComponentName, ComponentNameRepr, defineComponent } from "./Component"
import { ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { InputBit } from "./InputBit"

const GRID_WIDTH = 2
const GRID_UPPER_HEIGHT = 4.5
const GRID_LOWER_HEIGHT = 3.5

export const InputByteDef =
    defineComponent(0, 8, t.type({
        type: t.literal("byte"),
        val: typeOrUndefined(t.string),
        name: ComponentNameRepr,
        // radix: typeOrUndefined(t.number),
    }, "InputByte"))

type InputByteRepr = typeof InputByteDef.reprType

// TODO merge with InputNibble
export class InputByte extends ComponentBase<0, 8, InputByteRepr, FixedArray<LogicValue, 8>> {

    private static savedStateFrom(savedData: { val: string | undefined } | null): FixedArray<LogicValue, 8> {
        const inputs = FixedArrayFill(false as LogicValue, 8)
        if (isNull(savedData) || isUndefined(savedData.val)) {
            return inputs
        }
        const rep = savedData.val
        const lastIndex = rep.length - 1
        for (let i = 0; i < 8; i++) {
            const index = lastIndex - i
            if (index < 0) {
                break
            }
            inputs[i] = toLogicValueFromChar(rep[index])
        }
        return inputs
    }


    private _name: ComponentName = undefined
    // private _radix = DEFAULT_RADIX

    public constructor(editor: LogicEditor, savedData: InputByteRepr | null) {
        super(editor, InputByte.savedStateFrom(savedData), savedData, {
            outs: [
                [undefined, 2, -4, "e", "Out"],
                [undefined, 2, -3, "e", "Out"],
                [undefined, 2, -2, "e", "Out"],
                [undefined, 2, -1, "e", "Out"],
                [undefined, 2, 0, "e", "Out"],
                [undefined, 2, 1, "e", "Out"],
                [undefined, 2, 2, "e", "Out"],
                [undefined, 2, 3, "e", "Out"],
            ],
        })
        if (isNotNull(savedData)) {
            this._name = savedData.name
        }
    }

    toJSON() {
        return {
            type: "byte" as const,
            ...this.toJSONBase(),
            val: this.contentRepr(),
            name: this._name,
        }
    }

    private contentRepr(): string | undefined {
        const value = this.value
        let nontrivial = false
        for (let i = 0; i < 8; i++) {
            if (value[i] !== false) {
                nontrivial = true
                break
            }
        }
        if (!nontrivial) {
            return undefined
        }

        return this.value.map(toLogicValueRepr).reverse().join("")
    }


    public get componentType() {
        return "in" as const
    }

    override get cursorWhenMouseover() {
        return this.editor.mode === Mode.STATIC ? "not-allowed" : "pointer"
    }

    get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    get unrotatedHeight() {
        return (GRID_UPPER_HEIGHT + GRID_UPPER_HEIGHT) * GRID_STEP
    }

    override isOver(x: number, y: number) {
        return inRect(this.posX, this.posY, this.width, this.height, x, y)
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(S.Components.InputNibble.tooltip))
    }

    protected doRecalcValue(): FixedArray<LogicValue, 8> {
        // this never changes on its own, just upon user interaction
        return this.value
    }

    protected override propagateValue(newValue: FixedArray<LogicValue, 8>) {
        for (let i = 0; i < 8; i++) {
            this.outputs[i].value = newValue[i]
        }
    }

    doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        g.fillStyle = COLOR_BACKGROUND
        const drawMouseOver = ctx.isMouseOver && this.editor.mode !== Mode.STATIC
        g.strokeStyle = drawMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 4

        const width = GRID_WIDTH * GRID_STEP
        const left = this.posX - width / 2
        const right = left + width
        const top = this.posY - GRID_UPPER_HEIGHT * GRID_STEP
        const bottom = this.posY + GRID_LOWER_HEIGHT * GRID_STEP
        const height = bottom - top

        g.beginPath()
        g.rect(left, top, width, height)
        g.fill()
        g.stroke()

        const displayValues = this.editor.options.hideInputColors ? FixedArrayFill(Unknown, 8) : this.value

        g.lineWidth = 1
        const cellHeight = GRID_STEP
        for (let i = 0; i < 8; i++) {
            const y = top + i * cellHeight
            g.fillStyle = colorForBoolean(displayValues[i])
            g.beginPath()
            g.rect(left, y, width, cellHeight)
            g.fill()
            g.stroke()
        }

        for (const output of this.outputs) {
            drawWireLineToComponent(g, output, right + 2, output.posYInParentTransform, true)
        }

        ctx.inNonTransformedFrame(ctx => {
            if (isDefined(this._name)) {
                const valueString = displayValues.map(toLogicValueRepr).join("")
                drawComponentName(g, ctx, this._name, valueString, this, false)
            }

            for (let i = 0; i < 8; i++) {
                const y = top + cellHeight / 2 + i * cellHeight
                drawRoundValue(g, displayValues[i], ...ctx.rotatePoint(this.posX, y), { small: true })
            }
        })
    }

    private doSetName(name: ComponentName) {
        this._name = name
        this.setNeedsRedraw("name changed")
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        return [
            ["mid", this.makeSetNameContextMenuItem(this._name, this.doSetName.bind(this))],
        ]
    }


    override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            this.runSetNameDialog(this._name, this.doSetName.bind(this))
        }
    }

    override mouseClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseClicked(e)) {
            return true
        }

        // TODO rotate coordinates here
        const editor = this.editor
        if (editor.mode === Mode.STATIC) {
            return false
        }
        const y = editor.offsetXYForComponent(e, this)[1] - this.posY + GRID_UPPER_HEIGHT * GRID_STEP
        const i = Math.floor(y / GRID_STEP)

        if (i >= 0 && i < 8) {
            const newValues = [...this.value]
            newValues[i] = InputBit.nextValue(newValues[i], editor.mode, e.altKey)
            this.doSetValue(newValues as unknown as FixedArray<LogicValue, 8>)
        }

        return true
    }

}
