import * as t from "io-ts"
import { colorForBoolean, COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { FixedArrayFill, FixedReadonlyArray, HighImpedance, isHighImpedance, isUnknown, LogicValue, Unknown } from "../utils"
import { ComponentBase, defineComponent } from "./Component"
import { DrawContext } from "./Drawable"

export const QuadTriStateDef =
    defineComponent(5, 4, t.type({
        type: t.literal("quad-tristate"),
    }, "QuadTriState"))

const INPUT = {
    I: [0, 1, 2, 3] as const,
    E: 4 as const,
}

const GRID_WIDTH = 4
const GRID_HEIGHT = 8

export type QuadTriStateRepr = typeof QuadTriStateDef.reprType

export class QuadTriState extends ComponentBase<5, 4, QuadTriStateRepr, FixedReadonlyArray<LogicValue, 4>> {

    public constructor(editor: LogicEditor, savedData: QuadTriStateRepr | null) {
        super(editor, FixedArrayFill(HighImpedance, 4), savedData, {
            ins: [
                ["I0", -3, -3, "w", "In"],
                ["I1", -3, -1, "w", "In"],
                ["I2", -3, +1, "w", "In"],
                ["I3", -3, +3, "w", "In"],
                ["E (Enable)", 0, +5, "s"],
            ],
            outs: [
                ["O0", +3, -3, "e", "Out"],
                ["O1", +3, -1, "e", "Out"],
                ["O2", +3, +1, "e", "Out"],
                ["O3", +3, +3, "e", "Out"],
            ],
        })
    }

    toJSON() {
        return {
            type: "quad-tristate" as const,
            ...this.toJSONBase(),
        }
    }

    public get componentType() {
        return "ic" as const
    }

    get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    get unrotatedHeight() {
        return GRID_HEIGHT * GRID_STEP
    }

    public override makeTooltip() {
        const s = S.Components.QuadTriState.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc)
        ))
    }

    protected doRecalcValue(): FixedReadonlyArray<LogicValue, 4> {
        const input = this.inputValues<4>(INPUT.I)
        const enable = this.inputs[INPUT.E].value

        if (isUnknown(enable) || isHighImpedance(enable)) {
            return FixedArrayFill(Unknown, 4)
        }

        if (!enable) {
            return FixedArrayFill(HighImpedance, 4)
        }

        return input
    }

    protected override propagateValue(newValue: FixedReadonlyArray<LogicValue, 4>) {
        for (let i = 0; i < 4; i++) {
            this.outputs[i].value = newValue[i]
        }
    }

    doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const enable = this.inputs[INPUT.E].value

        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP
        const left = this.posX - width / 2
        const right = left + width
        const bottom = this.posY + height / 2

        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 3

        g.beginPath()
        g.rect(this.posX - width / 2, this.posY - height / 2, width, height)
        g.fill()
        g.stroke()

        g.lineWidth = 2
        g.strokeStyle = colorForBoolean(enable)
        g.beginPath()
        g.moveTo(this.posX, bottom - 3)
        g.lineTo(this.posX, this.posY + 4)
        g.stroke()

        g.strokeStyle = COLOR_COMPONENT_BORDER
        g.beginPath()
        g.moveTo(left + 12, this.posY - 8)
        g.lineTo(right - 13, this.posY)
        g.lineTo(left + 12, this.posY + 8)
        g.closePath()
        g.stroke()


        for (const i of INPUT.I) {
            const input = this.inputs[i]
            drawWireLineToComponent(g, input, left - 2, input.posYInParentTransform)
        }

        drawWireLineToComponent(g, this.inputs[INPUT.E], this.inputs[INPUT.E].posXInParentTransform, bottom + 2)


        for (const output of this.outputs) {
            drawWireLineToComponent(g, output, right + 2, output.posYInParentTransform)
        }
    }
}
