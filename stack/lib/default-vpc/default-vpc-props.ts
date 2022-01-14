import BaseStackProps from "../base-stack-props";

export default class extends BaseStackProps {
    constructor(baseProps : BaseStackProps) {
        super(baseProps);
        Object.assign(this, baseProps);
    }
}