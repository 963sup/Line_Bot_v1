import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Component0 from "../src/shared/ui/accordion";
import * as Component2 from "../src/shared/ui/alert";
import * as Component1 from "../src/shared/ui/alert-dialog";
import * as Component3 from "../src/shared/ui/aspect-ratio";
import * as Component4 from "../src/shared/ui/attachment";
import * as Component5 from "../src/shared/ui/avatar";
import * as Component6 from "../src/shared/ui/badge";
import * as Component7 from "../src/shared/ui/breadcrumb";
import * as Component8 from "../src/shared/ui/bubble";
import * as Component10 from "../src/shared/ui/button";
import * as Component9 from "../src/shared/ui/button-group";
import * as Component11 from "../src/shared/ui/calendar";
import * as Component12 from "../src/shared/ui/card";
import * as Component13 from "../src/shared/ui/carousel";
import * as Component14 from "../src/shared/ui/chart";
import * as Component15 from "../src/shared/ui/checkbox";
import * as Component16 from "../src/shared/ui/code-block";
import * as Component17 from "../src/shared/ui/collapsible";
import * as Component18 from "../src/shared/ui/combobox";
import * as Component19 from "../src/shared/ui/command";
import * as Component20 from "../src/shared/ui/context-menu";
import * as Component21 from "../src/shared/ui/dialog";
import * as Component22 from "../src/shared/ui/direction";
import * as Component23 from "../src/shared/ui/drawer";
import * as Component24 from "../src/shared/ui/dropdown-menu";
import * as Component25 from "../src/shared/ui/empty";
import * as Component26 from "../src/shared/ui/field";
import * as Component27 from "../src/shared/ui/highlighter";
import { useHighlightedCode } from "../src/shared/ui/hooks/use-highlighted-code";
import * as Component28 from "../src/shared/ui/hover-card";
import * as Component31 from "../src/shared/ui/input";
import * as Component29 from "../src/shared/ui/input-group";
import * as Component30 from "../src/shared/ui/input-otp";
import * as Component32 from "../src/shared/ui/item";
import * as Component33 from "../src/shared/ui/kbd";
import * as Component34 from "../src/shared/ui/label";
import * as Component35 from "../src/shared/ui/marker";
import * as Component36 from "../src/shared/ui/menubar";
import * as Component38 from "../src/shared/ui/message";
import * as Component37 from "../src/shared/ui/message-scroller";
import * as Component39 from "../src/shared/ui/native-select";
import * as Component40 from "../src/shared/ui/navigation-menu";
import * as Component41 from "../src/shared/ui/pagination";
import * as Component42 from "../src/shared/ui/popover";
import * as Component43 from "../src/shared/ui/progress";
import * as Component44 from "../src/shared/ui/questionnaire";
import * as Component45 from "../src/shared/ui/radio-group";
import * as Component46 from "../src/shared/ui/resizable";
import * as Component47 from "../src/shared/ui/scroll-area";
import * as Component48 from "../src/shared/ui/select";
import * as Component49 from "../src/shared/ui/separator";
import * as Component50 from "../src/shared/ui/sheet";
import * as Component51 from "../src/shared/ui/sidebar";
import * as Component52 from "../src/shared/ui/skeleton";
import * as Component53 from "../src/shared/ui/slider";
import * as Component54 from "../src/shared/ui/sonner";
import * as Component55 from "../src/shared/ui/spinner";
import * as Component56 from "../src/shared/ui/switch";
import * as Component57 from "../src/shared/ui/table";
import * as Component58 from "../src/shared/ui/tabs";
import * as Component59 from "../src/shared/ui/textarea";
import * as Component61 from "../src/shared/ui/toggle";
import * as Component60 from "../src/shared/ui/toggle-group";
import * as Component62 from "../src/shared/ui/tooltip";
import * as Component63 from "../src/shared/ui/trace";
import { cn } from "../src/shared/ui/utils";

const catalog = {
  accordion: {
    Accordion: Component0.Accordion,
    AccordionContent: Component0.AccordionContent,
    AccordionItem: Component0.AccordionItem,
    AccordionTrigger: Component0.AccordionTrigger,
  },
  "alert-dialog": {
    AlertDialog: Component1.AlertDialog,
    AlertDialogAction: Component1.AlertDialogAction,
    AlertDialogCancel: Component1.AlertDialogCancel,
    AlertDialogContent: Component1.AlertDialogContent,
    AlertDialogDescription: Component1.AlertDialogDescription,
    AlertDialogFooter: Component1.AlertDialogFooter,
    AlertDialogHeader: Component1.AlertDialogHeader,
    AlertDialogMedia: Component1.AlertDialogMedia,
    AlertDialogOverlay: Component1.AlertDialogOverlay,
    AlertDialogPortal: Component1.AlertDialogPortal,
    AlertDialogTitle: Component1.AlertDialogTitle,
    AlertDialogTrigger: Component1.AlertDialogTrigger,
  },
  alert: {
    Alert: Component2.Alert,
    AlertAction: Component2.AlertAction,
    AlertDescription: Component2.AlertDescription,
    AlertTitle: Component2.AlertTitle,
  },
  "aspect-ratio": { AspectRatio: Component3.AspectRatio },
  attachment: {
    Attachment: Component4.Attachment,
    AttachmentAction: Component4.AttachmentAction,
    AttachmentActions: Component4.AttachmentActions,
    AttachmentContent: Component4.AttachmentContent,
    AttachmentDescription: Component4.AttachmentDescription,
    AttachmentGroup: Component4.AttachmentGroup,
    AttachmentMedia: Component4.AttachmentMedia,
    AttachmentTitle: Component4.AttachmentTitle,
    AttachmentTrigger: Component4.AttachmentTrigger,
  },
  avatar: {
    Avatar: Component5.Avatar,
    AvatarBadge: Component5.AvatarBadge,
    AvatarFallback: Component5.AvatarFallback,
    AvatarGroup: Component5.AvatarGroup,
    AvatarGroupCount: Component5.AvatarGroupCount,
    AvatarImage: Component5.AvatarImage,
  },
  badge: { Badge: Component6.Badge, badgeVariants: Component6.badgeVariants },
  breadcrumb: {
    Breadcrumb: Component7.Breadcrumb,
    BreadcrumbEllipsis: Component7.BreadcrumbEllipsis,
    BreadcrumbItem: Component7.BreadcrumbItem,
    BreadcrumbLink: Component7.BreadcrumbLink,
    BreadcrumbList: Component7.BreadcrumbList,
    BreadcrumbPage: Component7.BreadcrumbPage,
    BreadcrumbSeparator: Component7.BreadcrumbSeparator,
  },
  bubble: {
    Bubble: Component8.Bubble,
    BubbleContent: Component8.BubbleContent,
    BubbleGroup: Component8.BubbleGroup,
    BubbleReactions: Component8.BubbleReactions,
  },
  "button-group": {
    ButtonGroup: Component9.ButtonGroup,
    ButtonGroupSeparator: Component9.ButtonGroupSeparator,
    ButtonGroupText: Component9.ButtonGroupText,
    buttonGroupVariants: Component9.buttonGroupVariants,
  },
  button: { Button: Component10.Button, buttonVariants: Component10.buttonVariants },
  calendar: { Calendar: Component11.Calendar, CalendarDayButton: Component11.CalendarDayButton },
  card: {
    Card: Component12.Card,
    CardAction: Component12.CardAction,
    CardContent: Component12.CardContent,
    CardDescription: Component12.CardDescription,
    CardFooter: Component12.CardFooter,
    CardHeader: Component12.CardHeader,
    CardTitle: Component12.CardTitle,
  },
  carousel: {
    Carousel: Component13.Carousel,
    CarouselContent: Component13.CarouselContent,
    CarouselItem: Component13.CarouselItem,
    CarouselNext: Component13.CarouselNext,
    CarouselPrevious: Component13.CarouselPrevious,
    useCarousel: Component13.useCarousel,
  },
  chart: {
    ChartContainer: Component14.ChartContainer,
    ChartLegend: Component14.ChartLegend,
    ChartLegendContent: Component14.ChartLegendContent,
    ChartStyle: Component14.ChartStyle,
    ChartTooltip: Component14.ChartTooltip,
    ChartTooltipContent: Component14.ChartTooltipContent,
  },
  checkbox: { Checkbox: Component15.Checkbox },
  "code-block": {
    CodeBlock: Component16.CodeBlock,
    CodeBlockActions: Component16.CodeBlockActions,
    CodeBlockContent: Component16.CodeBlockContent,
    CodeBlockCopyButton: Component16.CodeBlockCopyButton,
    CodeBlockFooter: Component16.CodeBlockFooter,
    CodeBlockHeader: Component16.CodeBlockHeader,
    CodeBlockLine: Component16.CodeBlockLine,
    CodeBlockTitle: Component16.CodeBlockTitle,
  },
  collapsible: {
    Collapsible: Component17.Collapsible,
    CollapsibleContent: Component17.CollapsibleContent,
    CollapsibleTrigger: Component17.CollapsibleTrigger,
  },
  combobox: {
    Combobox: Component18.Combobox,
    ComboboxChip: Component18.ComboboxChip,
    ComboboxChips: Component18.ComboboxChips,
    ComboboxChipsInput: Component18.ComboboxChipsInput,
    ComboboxCollection: Component18.ComboboxCollection,
    ComboboxContent: Component18.ComboboxContent,
    ComboboxEmpty: Component18.ComboboxEmpty,
    ComboboxGroup: Component18.ComboboxGroup,
    ComboboxInput: Component18.ComboboxInput,
    ComboboxItem: Component18.ComboboxItem,
    ComboboxLabel: Component18.ComboboxLabel,
    ComboboxList: Component18.ComboboxList,
    ComboboxSeparator: Component18.ComboboxSeparator,
    ComboboxTrigger: Component18.ComboboxTrigger,
    ComboboxValue: Component18.ComboboxValue,
    useComboboxAnchor: Component18.useComboboxAnchor,
  },
  command: {
    Command: Component19.Command,
    CommandDialog: Component19.CommandDialog,
    CommandEmpty: Component19.CommandEmpty,
    CommandGroup: Component19.CommandGroup,
    CommandInput: Component19.CommandInput,
    CommandItem: Component19.CommandItem,
    CommandList: Component19.CommandList,
    CommandSeparator: Component19.CommandSeparator,
    CommandShortcut: Component19.CommandShortcut,
  },
  "context-menu": {
    ContextMenu: Component20.ContextMenu,
    ContextMenuCheckboxItem: Component20.ContextMenuCheckboxItem,
    ContextMenuContent: Component20.ContextMenuContent,
    ContextMenuGroup: Component20.ContextMenuGroup,
    ContextMenuItem: Component20.ContextMenuItem,
    ContextMenuLabel: Component20.ContextMenuLabel,
    ContextMenuPortal: Component20.ContextMenuPortal,
    ContextMenuRadioGroup: Component20.ContextMenuRadioGroup,
    ContextMenuRadioItem: Component20.ContextMenuRadioItem,
    ContextMenuSeparator: Component20.ContextMenuSeparator,
    ContextMenuShortcut: Component20.ContextMenuShortcut,
    ContextMenuSub: Component20.ContextMenuSub,
    ContextMenuSubContent: Component20.ContextMenuSubContent,
    ContextMenuSubTrigger: Component20.ContextMenuSubTrigger,
    ContextMenuTrigger: Component20.ContextMenuTrigger,
  },
  dialog: {
    Dialog: Component21.Dialog,
    DialogClose: Component21.DialogClose,
    DialogContent: Component21.DialogContent,
    DialogDescription: Component21.DialogDescription,
    DialogFooter: Component21.DialogFooter,
    DialogHeader: Component21.DialogHeader,
    DialogOverlay: Component21.DialogOverlay,
    DialogPortal: Component21.DialogPortal,
    DialogTitle: Component21.DialogTitle,
    DialogTrigger: Component21.DialogTrigger,
  },
  direction: {
    DirectionProvider: Component22.DirectionProvider,
    useDirection: Component22.useDirection,
  },
  drawer: {
    Drawer: Component23.Drawer,
    DrawerClose: Component23.DrawerClose,
    DrawerContent: Component23.DrawerContent,
    DrawerDescription: Component23.DrawerDescription,
    DrawerFooter: Component23.DrawerFooter,
    DrawerHeader: Component23.DrawerHeader,
    DrawerOverlay: Component23.DrawerOverlay,
    DrawerPortal: Component23.DrawerPortal,
    DrawerTitle: Component23.DrawerTitle,
    DrawerTrigger: Component23.DrawerTrigger,
  },
  "dropdown-menu": {
    DropdownMenu: Component24.DropdownMenu,
    DropdownMenuCheckboxItem: Component24.DropdownMenuCheckboxItem,
    DropdownMenuContent: Component24.DropdownMenuContent,
    DropdownMenuGroup: Component24.DropdownMenuGroup,
    DropdownMenuItem: Component24.DropdownMenuItem,
    DropdownMenuLabel: Component24.DropdownMenuLabel,
    DropdownMenuPortal: Component24.DropdownMenuPortal,
    DropdownMenuRadioGroup: Component24.DropdownMenuRadioGroup,
    DropdownMenuRadioItem: Component24.DropdownMenuRadioItem,
    DropdownMenuSeparator: Component24.DropdownMenuSeparator,
    DropdownMenuShortcut: Component24.DropdownMenuShortcut,
    DropdownMenuSub: Component24.DropdownMenuSub,
    DropdownMenuSubContent: Component24.DropdownMenuSubContent,
    DropdownMenuSubTrigger: Component24.DropdownMenuSubTrigger,
    DropdownMenuTrigger: Component24.DropdownMenuTrigger,
  },
  empty: {
    Empty: Component25.Empty,
    EmptyContent: Component25.EmptyContent,
    EmptyDescription: Component25.EmptyDescription,
    EmptyHeader: Component25.EmptyHeader,
    EmptyMedia: Component25.EmptyMedia,
    EmptyTitle: Component25.EmptyTitle,
  },
  field: {
    Field: Component26.Field,
    FieldContent: Component26.FieldContent,
    FieldDescription: Component26.FieldDescription,
    FieldError: Component26.FieldError,
    FieldGroup: Component26.FieldGroup,
    FieldLabel: Component26.FieldLabel,
    FieldLegend: Component26.FieldLegend,
    FieldSeparator: Component26.FieldSeparator,
    FieldSet: Component26.FieldSet,
    FieldTitle: Component26.FieldTitle,
  },
  highlighter: {
    loadHighlighter: Component27.loadHighlighter,
    highlightCode: Component27.highlightCode,
  },
  "hover-card": {
    HoverCard: Component28.HoverCard,
    HoverCardContent: Component28.HoverCardContent,
    HoverCardTrigger: Component28.HoverCardTrigger,
  },
  "input-group": {
    InputGroup: Component29.InputGroup,
    InputGroupAddon: Component29.InputGroupAddon,
    InputGroupButton: Component29.InputGroupButton,
    InputGroupInput: Component29.InputGroupInput,
    InputGroupText: Component29.InputGroupText,
    InputGroupTextarea: Component29.InputGroupTextarea,
  },
  "input-otp": {
    InputOTP: Component30.InputOTP,
    InputOTPGroup: Component30.InputOTPGroup,
    InputOTPSeparator: Component30.InputOTPSeparator,
    InputOTPSlot: Component30.InputOTPSlot,
  },
  input: { Input: Component31.Input },
  item: {
    Item: Component32.Item,
    ItemActions: Component32.ItemActions,
    ItemContent: Component32.ItemContent,
    ItemDescription: Component32.ItemDescription,
    ItemFooter: Component32.ItemFooter,
    ItemGroup: Component32.ItemGroup,
    ItemHeader: Component32.ItemHeader,
    ItemMedia: Component32.ItemMedia,
    ItemSeparator: Component32.ItemSeparator,
    ItemTitle: Component32.ItemTitle,
  },
  kbd: { Kbd: Component33.Kbd, KbdGroup: Component33.KbdGroup },
  label: { Label: Component34.Label },
  marker: {
    Marker: Component35.Marker,
    MarkerContent: Component35.MarkerContent,
    MarkerIcon: Component35.MarkerIcon,
    markerVariants: Component35.markerVariants,
  },
  menubar: {
    Menubar: Component36.Menubar,
    MenubarCheckboxItem: Component36.MenubarCheckboxItem,
    MenubarContent: Component36.MenubarContent,
    MenubarGroup: Component36.MenubarGroup,
    MenubarItem: Component36.MenubarItem,
    MenubarLabel: Component36.MenubarLabel,
    MenubarMenu: Component36.MenubarMenu,
    MenubarPortal: Component36.MenubarPortal,
    MenubarRadioGroup: Component36.MenubarRadioGroup,
    MenubarRadioItem: Component36.MenubarRadioItem,
    MenubarSeparator: Component36.MenubarSeparator,
    MenubarShortcut: Component36.MenubarShortcut,
    MenubarSub: Component36.MenubarSub,
    MenubarSubContent: Component36.MenubarSubContent,
    MenubarSubTrigger: Component36.MenubarSubTrigger,
    MenubarTrigger: Component36.MenubarTrigger,
  },
  "message-scroller": {
    MessageScroller: Component37.MessageScroller,
    MessageScrollerButton: Component37.MessageScrollerButton,
    MessageScrollerContent: Component37.MessageScrollerContent,
    MessageScrollerItem: Component37.MessageScrollerItem,
    MessageScrollerProvider: Component37.MessageScrollerProvider,
    MessageScrollerViewport: Component37.MessageScrollerViewport,
    useMessageScroller: Component37.useMessageScroller,
    useMessageScrollerScrollable: Component37.useMessageScrollerScrollable,
    useMessageScrollerVisibility: Component37.useMessageScrollerVisibility,
  },
  message: {
    Message: Component38.Message,
    MessageAvatar: Component38.MessageAvatar,
    MessageContent: Component38.MessageContent,
    MessageFooter: Component38.MessageFooter,
    MessageGroup: Component38.MessageGroup,
    MessageHeader: Component38.MessageHeader,
  },
  "native-select": {
    NativeSelect: Component39.NativeSelect,
    NativeSelectOptGroup: Component39.NativeSelectOptGroup,
    NativeSelectOption: Component39.NativeSelectOption,
  },
  "navigation-menu": {
    NavigationMenu: Component40.NavigationMenu,
    NavigationMenuContent: Component40.NavigationMenuContent,
    NavigationMenuIndicator: Component40.NavigationMenuIndicator,
    NavigationMenuItem: Component40.NavigationMenuItem,
    NavigationMenuLink: Component40.NavigationMenuLink,
    NavigationMenuList: Component40.NavigationMenuList,
    NavigationMenuTrigger: Component40.NavigationMenuTrigger,
    NavigationMenuViewport: Component40.NavigationMenuViewport,
    navigationMenuTriggerStyle: Component40.navigationMenuTriggerStyle,
  },
  pagination: {
    Pagination: Component41.Pagination,
    PaginationContent: Component41.PaginationContent,
    PaginationEllipsis: Component41.PaginationEllipsis,
    PaginationItem: Component41.PaginationItem,
    PaginationLink: Component41.PaginationLink,
    PaginationNext: Component41.PaginationNext,
    PaginationPrevious: Component41.PaginationPrevious,
  },
  popover: {
    Popover: Component42.Popover,
    PopoverAnchor: Component42.PopoverAnchor,
    PopoverContent: Component42.PopoverContent,
    PopoverDescription: Component42.PopoverDescription,
    PopoverHeader: Component42.PopoverHeader,
    PopoverTitle: Component42.PopoverTitle,
    PopoverTrigger: Component42.PopoverTrigger,
  },
  progress: { Progress: Component43.Progress },
  questionnaire: {
    Questionnaire: Component44.Questionnaire,
    QuestionnaireActions: Component44.QuestionnaireActions,
    QuestionnaireChoice: Component44.QuestionnaireChoice,
    QuestionnaireChoiceDescription: Component44.QuestionnaireChoiceDescription,
    QuestionnaireChoices: Component44.QuestionnaireChoices,
    QuestionnaireDescription: Component44.QuestionnaireDescription,
    QuestionnaireError: Component44.QuestionnaireError,
    QuestionnaireInput: Component44.QuestionnaireInput,
    QuestionnaireItem: Component44.QuestionnaireItem,
    QuestionnaireNext: Component44.QuestionnaireNext,
    QuestionnairePrevious: Component44.QuestionnairePrevious,
    QuestionnaireProgress: Component44.QuestionnaireProgress,
    QuestionnaireSkip: Component44.QuestionnaireSkip,
    QuestionnaireSubmit: Component44.QuestionnaireSubmit,
    QuestionnaireTitle: Component44.QuestionnaireTitle,
  },
  "radio-group": { RadioGroup: Component45.RadioGroup, RadioGroupItem: Component45.RadioGroupItem },
  resizable: {
    ResizableHandle: Component46.ResizableHandle,
    ResizablePanel: Component46.ResizablePanel,
    ResizablePanelGroup: Component46.ResizablePanelGroup,
  },
  "scroll-area": { ScrollArea: Component47.ScrollArea, ScrollBar: Component47.ScrollBar },
  select: {
    Select: Component48.Select,
    SelectContent: Component48.SelectContent,
    SelectGroup: Component48.SelectGroup,
    SelectItem: Component48.SelectItem,
    SelectLabel: Component48.SelectLabel,
    SelectScrollDownButton: Component48.SelectScrollDownButton,
    SelectScrollUpButton: Component48.SelectScrollUpButton,
    SelectSeparator: Component48.SelectSeparator,
    SelectTrigger: Component48.SelectTrigger,
    SelectValue: Component48.SelectValue,
  },
  separator: { Separator: Component49.Separator },
  sheet: {
    Sheet: Component50.Sheet,
    SheetClose: Component50.SheetClose,
    SheetContent: Component50.SheetContent,
    SheetDescription: Component50.SheetDescription,
    SheetFooter: Component50.SheetFooter,
    SheetHeader: Component50.SheetHeader,
    SheetTitle: Component50.SheetTitle,
    SheetTrigger: Component50.SheetTrigger,
  },
  sidebar: {
    Sidebar: Component51.Sidebar,
    SidebarContent: Component51.SidebarContent,
    SidebarFooter: Component51.SidebarFooter,
    SidebarGroup: Component51.SidebarGroup,
    SidebarGroupAction: Component51.SidebarGroupAction,
    SidebarGroupContent: Component51.SidebarGroupContent,
    SidebarGroupLabel: Component51.SidebarGroupLabel,
    SidebarHeader: Component51.SidebarHeader,
    SidebarInput: Component51.SidebarInput,
    SidebarInset: Component51.SidebarInset,
    SidebarMenu: Component51.SidebarMenu,
    SidebarMenuAction: Component51.SidebarMenuAction,
    SidebarMenuBadge: Component51.SidebarMenuBadge,
    SidebarMenuButton: Component51.SidebarMenuButton,
    SidebarMenuItem: Component51.SidebarMenuItem,
    SidebarMenuSkeleton: Component51.SidebarMenuSkeleton,
    SidebarMenuSub: Component51.SidebarMenuSub,
    SidebarMenuSubButton: Component51.SidebarMenuSubButton,
    SidebarMenuSubItem: Component51.SidebarMenuSubItem,
    SidebarProvider: Component51.SidebarProvider,
    SidebarRail: Component51.SidebarRail,
    SidebarSeparator: Component51.SidebarSeparator,
    SidebarTrigger: Component51.SidebarTrigger,
    useSidebar: Component51.useSidebar,
  },
  skeleton: { Skeleton: Component52.Skeleton },
  slider: { Slider: Component53.Slider },
  sonner: { Toaster: Component54.Toaster },
  spinner: { Spinner: Component55.Spinner },
  switch: { Switch: Component56.Switch },
  table: {
    Table: Component57.Table,
    TableBody: Component57.TableBody,
    TableCaption: Component57.TableCaption,
    TableCell: Component57.TableCell,
    TableFooter: Component57.TableFooter,
    TableHead: Component57.TableHead,
    TableHeader: Component57.TableHeader,
    TableRow: Component57.TableRow,
  },
  tabs: {
    Tabs: Component58.Tabs,
    TabsContent: Component58.TabsContent,
    TabsList: Component58.TabsList,
    TabsTrigger: Component58.TabsTrigger,
    tabsListVariants: Component58.tabsListVariants,
  },
  textarea: { Textarea: Component59.Textarea },
  "toggle-group": {
    ToggleGroup: Component60.ToggleGroup,
    ToggleGroupItem: Component60.ToggleGroupItem,
  },
  toggle: { Toggle: Component61.Toggle, toggleVariants: Component61.toggleVariants },
  tooltip: {
    Tooltip: Component62.Tooltip,
    TooltipContent: Component62.TooltipContent,
    TooltipProvider: Component62.TooltipProvider,
    TooltipTrigger: Component62.TooltipTrigger,
  },
  trace: {
    Trace: Component63.Trace,
    TraceCollapsible: Component63.TraceCollapsible,
    TraceCollapsibleContent: Component63.TraceCollapsibleContent,
    TraceCollapsibleTrigger: Component63.TraceCollapsibleTrigger,
    TraceDescription: Component63.TraceDescription,
    TraceIcon: Component63.TraceIcon,
    TraceLine: Component63.TraceLine,
    TraceTitle: Component63.TraceTitle,
  },
};

// Cold-import the complete downloaded catalog, including optional heavy dependencies.
// This verifies availability, not every component's interactive behavior.
test("the complete shadcn catalog loads without browser globals", () => {
  const files = readdirSync(new URL("../src/shared/ui/", import.meta.url))
    .filter((name) => name.endsWith(".tsx") && name !== "page-layout.tsx")
    .map((name) => name.slice(0, -4))
    .sort();
  assert.deepEqual(Object.keys(catalog).sort(), files);
  assert.equal(files.length, 64);
  for (const [name, component] of Object.entries(catalog)) {
    assert.ok(Object.keys(component).length > 0, name + " must expose a usable API");
    for (const [symbol, value] of Object.entries(component)) {
      assert.notEqual(value, undefined, name + "." + symbol);
    }
  }
});

test("class composition keeps the last conflicting utility", () => {
  assert.equal(cn("px-2", false, "px-4"), "px-4");
});

test("chart tokens and carousel API compose on the server", () => {
  const config: Component14.ChartConfig = {
    requests: { label: "Requests", theme: { light: "#087f55", dark: "#58a6ff" } },
  };
  const chart = renderToStaticMarkup(
    createElement(Component14.ChartStyle, { id: "requests", config }),
  );
  assert.ok(chart.includes(":is(.dark, .app-shell)"));
  assert.ok(chart.includes("--color-requests: #087f55"));
  const setApi = (api: Component13.CarouselApi) => {
    assert.equal(typeof api?.scrollNext, "function");
  };
  const carousel = renderToStaticMarkup(
    createElement(
      Component13.Carousel,
      { setApi },
      createElement(
        Component13.CarouselContent,
        null,
        createElement(Component13.CarouselItem, null, "Slide"),
      ),
    ),
  );
  assert.ok(carousel.includes("Slide"));
});

test("code highlighting supports aliases, streaming state and unknown-language fallback", async () => {
  const highlighter = await Component27.loadHighlighter("ts");
  assert.ok(highlighter);
  const head = highlighter.highlight("const value = 1;");
  const tail = highlighter.highlight("console.log(value);", head.state);
  assert.equal(head.lines.length, 1);
  assert.equal(tail.lines.length, 1);
  assert.ok((await Component27.highlightCode("const value = 1;", "typescript"))?.length);
  assert.equal(await Component27.highlightCode("plain text", "unknown-language"), null);
  function Fallback() {
    return createElement("code", null, useHighlightedCode("plain text", "unknown-language"));
  }
  assert.equal(renderToStaticMarkup(createElement(Fallback)), "<code>plain text</code>");
});
