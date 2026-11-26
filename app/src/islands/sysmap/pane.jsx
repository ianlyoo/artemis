import { LayoutPanel } from "@astryxdesign/core/Layout";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { Detail } from "./detail.jsx";
export default function SidePane({ size, figures, ...props }) {
  const resizable = useResizable({ defaultSize: size, minSize: 280, maxSize: 760, autoSaveId: "home-sysmap-detail" });
  return <>
      <ResizeHandle resizable={resizable} label="Resize the column" isReversed />
      {}
      <LayoutPanel resizable={resizable} label={props.id ? "Node details" : "Figures"} padding={0} className="sm-panel">
        {props.id ? <Detail key={props.id} {...props} /> : figures}
      </LayoutPanel>
    </>;
}
