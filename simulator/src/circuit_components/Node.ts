import { InputState, Mode } from "./Enums.js"
import { wireMng, mode, fillForBoolean } from "../simulator.js"
import { GRID_STEP, HasPosition, PositionSupport } from "./Component.js"

export const nodeList: Node[] = []

let nextNodeID = 0

const DIAMETER = 8
const HIT_RANGE = DIAMETER + 2 // not more to avoid matching more than 1 vertically if aligned on grid

export class Node extends PositionSupport {

    private _inputState: number = InputState.FREE // only once input per node
    private _isAlive = true // not destroyed
    private _brotherNode: Node | null = null // for short circuit
    private _id = nextNodeID++

    constructor(
        private _parent: HasPosition,
        private _gridOffsetX: number,
        private _gridOffsetY: number,
        private _isOutput = false,
        private _value = false
    ) {
        super()
        nodeList[this._id] = this
        this.updatePositionFromParent()
    }

    // public get id() { return this._id }

    destroy() {
        this._isAlive = false
        delete nodeList[this._id]
    }

    draw() {
        fillForBoolean(this._value)

        stroke(0)
        strokeWeight(1)
        circle(this.posX, this.posY, DIAMETER)

        if (this.isMouseOver()) {
            fill(128, 128)
            noStroke()
            circle(this.posX, this.posY, DIAMETER * 2)
        }
    }

    public get id() {
        return this._id
    }

    public set id(newID: number) {
        if (nodeList[this.id] === this) {
            delete nodeList[this.id]
        }

        this._id = newID
        nodeList[newID] = this

        //update max id
        if (newID >= nextNodeID) {
            nextNodeID = newID + 1
        }
    }

    public get isAlive() {
        return this._isAlive
    }

    public get isOutput() {
        return this._isOutput
    }

    public get inputState() {
        return this._inputState
    }

    public set inputState(state: number) {
        this._inputState = state
    }

    public get brotherNode() {
        return this._brotherNode
    }

    public set brotherNode(newNode: Node | null) {
        this._brotherNode = newNode
    }

    public get value(): boolean {
        return this._value
    }

    public set value(val: boolean) {
        this._value = val
    }

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

    updatePositionFromParent() {
        return this.updatePosition(
            this._parent.posX + this._gridOffsetX * GRID_STEP,
            this._parent.posY + this._gridOffsetY * GRID_STEP,
            false,
        )
    }

    isMouseOver() {
        return mode >= Mode.CONNECT && dist(mouseX, mouseY, this.posX, this.posY) < HIT_RANGE / 2
    }

    mouseClicked() {
        if (this.isMouseOver() && (this.inputState === InputState.FREE || this.isOutput)) {
            wireMng.addNode(this)
            return true
        }
        return false
    }

}
