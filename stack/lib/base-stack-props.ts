import { IStackSynthesizer, StackProps } from "aws-cdk-lib";
import { Environment } from "aws-cdk-lib/cx-api";

/**
 * Base Stack Props
 */
export default class BaseStackProps implements StackProps {
    
    public analyticsReporting?: boolean | undefined;
    public description?: string | undefined;
    public env?: Environment | undefined;
    public stackName?: string | undefined;
    public synthesizer?: IStackSynthesizer | undefined;
    public tags?: {
        [key: string]: string;
    } | undefined;

    /**
     * Default constructor
     * @param props base props
     */
    constructor(props: StackProps | undefined) {
        Object.assign(this, props);
    }
}