import { drawWaypoint, GRID_STEP, isOverWaypoint, WAYPOINT_DIAMETER } from "../drawutils"
import { LogicEditor } from "../LogicEditor"
import { HighImpedance, isDefined, isNull, isUnknown, LogicValue, Mode, toLogicValue, Unknown } from "../utils"
import { ComponentState, InputNodeRepr, NodeGroup, OutputNodeRepr } from "./Component"
import { DrawableWithPosition, DrawContext, Orientation } from "./Drawable"
import { Wire } from "./Wire"



// This should just be Component, but it then has some cyclic 
// type definition issue which causes problems
type NodeParent = DrawableWithPosition & { isMoving: boolean, state: ComponentState, setNeedsRecalc(): void, allowsForcedOutputs: boolean }

export type Node = NodeIn | NodeOut


export const WireColor = {
    black: "black",
    red: "red",
    blue: "blue",
    yellow: "yellow",
    green: "green",
    white: "white",
} as const

export const DEFAULT_WIRE_COLOR = WireColor.black

export type WireColor = keyof typeof WireColor

abstract class NodeBase<N extends Node> extends DrawableWithPosition {

    public readonly id: number
    private _isAlive = true
    private _value: LogicValue = false
    protected _initialValue: LogicValue | undefined = undefined
    protected _forceValue: LogicValue | undefined
    protected _color: WireColor = DEFAULT_WIRE_COLOR

    constructor(
        editor: LogicEditor,
        nodeSpec: InputNodeRepr | OutputNodeRepr,
        public readonly parent: NodeParent,
        public readonly group: NodeGroup<N> | undefined,
        public readonly name: string | undefined,
        private _gridOffsetX: number,
        private _gridOffsetY: number,
        relativePosition: Orientation,
    ) {
        super(editor, null)
        this.id = nodeSpec.id
        if ("force" in nodeSpec) {
            this._forceValue = toLogicValue(nodeSpec.force)
        }
        if ("color" in nodeSpec && isDefined(nodeSpec.color)) {
            this._color = nodeSpec.color
        }
        if ("initialValue" in nodeSpec && isDefined(nodeSpec.initialValue)) {
            const initialValue = toLogicValue(nodeSpec.initialValue)
            this._initialValue = initialValue
            this._value = initialValue
        }
        this.editor.nodeMgr.addLiveNode(this.asNode)
        this.updatePositionFromParent()
        this.doSetOrient(relativePosition)
    }

    private get asNode(): Node {
        return this as unknown as Node
    }

    get isOutput(): boolean {
        return Node.isOutput(this.asNode)
    }

    get unrotatedWidth() {
        return WAYPOINT_DIAMETER
    }

    get unrotatedHeight() {
        return WAYPOINT_DIAMETER
    }

    get color(): WireColor {
        return this._color
    }

    public doSetColor(color: WireColor) {
        this._color = color
        this.propagateColor(color)
        this.setNeedsRedraw("color changed")
    }

    protected propagateColor(__color: WireColor) {
        // nothing by default; overridden in NodeOut
    }

    override isOver(x: number, y: number) {
        return this.editor.mode >= Mode.CONNECT
            && this.acceptsMoreConnections
            && isOverWaypoint(x, y, this.posX, this.posY)
    }

    destroy() {
        this._isAlive = false
        this.editor.nodeMgr.removeLiveNode(this.asNode)
    }

    doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const mode = this.editor.mode
        if (mode < Mode.CONNECT) {
            return
        }

        const showForced = isDefined(this._forceValue) && mode >= Mode.FULL
        const showForcedWarning = mode >= Mode.FULL && !isUnknown(this._value) && !isUnknown(this.value) && this._value !== this.value
        const parentOrientIsVertical = Orientation.isVertical(this.parent.orient)
        const neutral = this.editor.options.hideWireColors
        drawWaypoint(g, ctx, this.posX, this.posY, this.value, ctx.isMouseOver, neutral, showForced, showForcedWarning, parentOrientIsVertical)
    }

    public get isAlive() {
        return this._isAlive
    }

    public get value(): LogicValue {
        return isDefined(this._forceValue) ? this._forceValue : this._value
    }

    public set value(val: LogicValue) {
        const oldVisibleValue = this.value
        if (val !== this._value) {
            this._value = val
            this.propagateNewValueIfNecessary(oldVisibleValue)
        }
    }

    protected propagateNewValueIfNecessary(oldVisibleValue: LogicValue) {
        const newVisibleValue = this.value
        if (newVisibleValue !== oldVisibleValue) {
            this.propagateNewValue(newVisibleValue)
        }
    }

    protected abstract propagateNewValue(newValue: LogicValue): void

    public abstract get forceValue(): LogicValue | undefined

    public abstract get initialValue(): LogicValue | undefined

    public get gridOffsetX() {
        return this._gridOffsetX
    }

    public set gridOffsetX(newVal: number) {
        this._gridOffsetX = newVal
        this.updatePositionFromParent()
    }

    public get gridOffsetY() {
        return this._gridOffsetY
    }

    public set gridOffsetY(newVal: number) {
        this._gridOffsetY = newVal
        this.updatePositionFromParent()
    }

    public abstract get acceptsMoreConnections(): boolean

    public abstract get isDisconnected(): boolean

    public get posXInParentTransform() {
        return this.parent.posX + this._gridOffsetX * GRID_STEP
    }

    public get posYInParentTransform() {
        return this.parent.posY + this._gridOffsetY * GRID_STEP
    }

    updatePositionFromParent() {
        const [appliedGridOffsetX, appliedGridOffsetY] = (() => {
            switch (this.parent.orient) {
                case "e": return [+this._gridOffsetX, +this._gridOffsetY]
                case "w": return [-this._gridOffsetX, -this._gridOffsetY]
                case "s": return [-this._gridOffsetY, +this._gridOffsetX]
                case "n": return [+this._gridOffsetY, -this._gridOffsetX]
            }
        })()
        return super.trySetPosition(
            this.parent.posX + appliedGridOffsetX * GRID_STEP,
            this.parent.posY + appliedGridOffsetY * GRID_STEP,
            false
        ) ?? [this.posX, this.posY]
    }

    public get wireProlongDirection(): Orientation {
        switch (this.parent.orient) {
            case "e":
                switch (this.orient) {
                    case "e": return "w"
                    case "w": return "e"
                    case "s": return "n"
                    case "n": return "s"
                }
                break
            case "w": return this.orient
            case "s":
                switch (this.orient) {
                    case "e": return "n"
                    case "w": return "s"
                    case "s": return "e"
                    case "n": return "w"
                }
                break
            case "n":
                switch (this.orient) {
                    case "e": return "s"
                    case "w": return "n"
                    case "s": return "w"
                    case "n": return "e"
                }
        }
    }

    override get cursorWhenMouseover() {
        return "crosshair"
    }

    override mouseDown(__: MouseEvent | TouchEvent) {
        this.editor.wireMgr.addNode(this.asNode)
        return { lockMouseOver: false }
    }

    override mouseUp(__: MouseEvent | TouchEvent) {
        this.editor.wireMgr.addNode(this.asNode)
    }

}

export class NodeIn extends NodeBase<NodeIn> {

    public readonly _tag = "_nodein"

    private _incomingWire: Wire | null = null
    public _prefersSpike = false

    get incomingWire() {
        return this._incomingWire
    }

    set incomingWire(wire: Wire | null) {
        this._incomingWire = wire
        if (isNull(wire)) {
            this.value = false
        } else {
            this.value = wire.startNode.value
        }
    }

    get acceptsMoreConnections() {
        return isNull(this._incomingWire)
    }

    get isDisconnected() {
        return isNull(this._incomingWire)
    }

    get forceValue() {
        return undefined
    }

    get initialValue() {
        return undefined
    }

    protected propagateNewValue(__newValue: LogicValue) {
        this.parent.setNeedsRecalc()
    }

}


export class NodeOut extends NodeBase<NodeOut> {
    
    public readonly _tag = "_nodeout"

    private readonly _outgoingWires: Wire[] = []

    addOutgoingWire(wire: Wire) {
        this._outgoingWires.push(wire)
    }

    removeOutgoingWire(wire: Wire) {
        const i = this._outgoingWires.indexOf(wire)
        if (i !== -1) {
            this._outgoingWires.splice(i, 1)
        }
    }

    get acceptsMoreConnections() {
        return true
    }

    get isDisconnected() {
        return this._outgoingWires.length === 0
    }
    
    findWireTo(node: NodeIn): Wire | undefined {
        return this._outgoingWires.find(wire => wire.endNode === node)
    }

    get forceValue() {
        return this._forceValue
    }

    set forceValue(newForceValue: LogicValue | undefined) {
        const oldVisibleValue = this.value
        this._forceValue = newForceValue
        this.propagateNewValueIfNecessary(oldVisibleValue)
        this.setNeedsRedraw("changed forced output value")
    }

    get initialValue() {
        return this._initialValue
    }

    protected override propagateColor(color: WireColor) {
        for (const wire of this._outgoingWires) {
            wire.endNode?.doSetColor(color)
        }
    }

    protected propagateNewValue(newValue: LogicValue) {
        const now = this.editor.timeline.adjustedTime()
        for (const wire of this._outgoingWires) {
            wire.propageNewValue(newValue, now)
        }
    }

    override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseDoubleClicked(e)) {
            return true // already handled
        }
        if (this.editor.mode >= Mode.FULL && e.altKey && this.isOutput && this.parent.allowsForcedOutputs) {
            this.forceValue = (() => {
                switch (this._forceValue) {
                    case undefined: return Unknown
                    case Unknown: return HighImpedance
                    case HighImpedance: return false
                    case false: return true
                    case true: return undefined
                }
            })()
            return true
        }
        return false
    }

}

export const Node = {
    isOutput(node: Node): node is NodeOut {
        return node._tag === "_nodeout"
    },
}
